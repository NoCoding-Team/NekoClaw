use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_store::StoreExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub name: String,
    pub backend_url: String,
}

const STORE_FILE: &str = "nekoclaw.json";
const ACCOUNTS_KEY: &str = "accounts";
const ACTIVE_ACCOUNT_KEY: &str = "active_account_id";
const AUTOSTART_KEY: &str = "autostart_enabled";

#[tauri::command]
async fn get_accounts(app: AppHandle) -> Result<Vec<Account>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let accounts = store
        .get(ACCOUNTS_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    Ok(accounts)
}

#[tauri::command]
async fn save_account(app: AppHandle, account: Account, token: Option<String>) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let mut accounts: Vec<Account> = store
        .get(ACCOUNTS_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    if let Some(pos) = accounts.iter().position(|a| a.id == account.id) {
        accounts[pos] = account.clone();
    } else {
        accounts.push(account.clone());
    }

    store
        .set(ACCOUNTS_KEY, serde_json::to_value(&accounts).unwrap());
    store.save().map_err(|e| e.to_string())?;

    if let Some(t) = token {
        if !t.is_empty() {
            store_token_in_keychain(&account.id, &t)?;
        }
    }

    Ok(())
}

#[tauri::command]
async fn delete_account(app: AppHandle, id: String) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let mut accounts: Vec<Account> = store
        .get(ACCOUNTS_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    accounts.retain(|a| a.id != id);
    store.set(ACCOUNTS_KEY, serde_json::to_value(&accounts).unwrap());

    let active: Option<String> = store
        .get(ACTIVE_ACCOUNT_KEY)
        .and_then(|v| serde_json::from_value(v).ok());
    if active.as_deref() == Some(&id) {
        store.delete(ACTIVE_ACCOUNT_KEY);
    }

    store.save().map_err(|e| e.to_string())?;
    delete_token_from_keychain(&id)?;
    Ok(())
}

#[tauri::command]
async fn get_active_account_id(app: AppHandle) -> Option<String> {
    let store = app.store(STORE_FILE).ok()?;
    store
        .get(ACTIVE_ACCOUNT_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
}

#[tauri::command]
async fn set_active_account_id(app: AppHandle, id: String) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(ACTIVE_ACCOUNT_KEY, serde_json::to_value(&id).unwrap());
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_token(account_id: String) -> Result<String, String> {
    read_token_from_keychain(&account_id)
}

#[tauri::command]
async fn store_token_in_keychain_cmd(account_id: String, token: String) -> Result<(), String> {
    store_token_in_keychain(&account_id, &token)
}

#[tauri::command]
async fn delete_token_from_keychain_cmd(account_id: String) -> Result<(), String> {
    delete_token_from_keychain(&account_id)
}

#[tauri::command]
async fn inject_token_to_webview(
    app: AppHandle,
    token: String,
    account_id: String,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let token_json = serde_json::to_string(&token).map_err(|e| e.to_string())?;
    let account_id_json = serde_json::to_string(&account_id).map_err(|e| e.to_string())?;
    let script = format!(
        "(()=>{{const f=document.querySelector('.portal-iframe');if(f&&f.contentWindow)f.contentWindow.postMessage({{type:'nekoclaw:token-inject',token:{},accountId:{}}}, '*');}})()",
        token_json, account_id_json
    );
    window.eval(&script).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_autostart(app: AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
}

fn store_token_in_keychain(account_id: &str, token: &str) -> Result<(), String> {
    keytar_set(account_id, token)
}

fn delete_token_from_keychain(account_id: &str) -> Result<(), String> {
    keytar_delete(account_id)
}

fn read_token_from_keychain(account_id: &str) -> Result<String, String> {
    keytar_get(account_id)
}

fn keytar_get(account_id: &str) -> Result<String, String> {
    use std::process::Command;
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args([
                "-Command",
                &format!(
                    "[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String((Get-StoredCredential -Target 'nekoclaw:{account_id}').Password))"
                ),
            ])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
        }
    }
    Ok(String::new())
}

fn keytar_set(account_id: &str, token: &str) -> Result<(), String> {
    use std::process::Command;
    #[cfg(target_os = "windows")]
    {
        let cmd = format!(
            "New-StoredCredential -Target 'nekoclaw:{account_id}' -Password '{token}' -Persist LocalMachine | Out-Null"
        );
        Command::new("powershell")
            .args(["-Command", &cmd])
            .output()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn keytar_delete(account_id: &str) -> Result<(), String> {
    use std::process::Command;
    #[cfg(target_os = "windows")]
    {
        let cmd = format!("Remove-StoredCredential -Target 'nekoclaw:{account_id}' -ErrorAction SilentlyContinue");
        Command::new("powershell")
            .args(["-Command", &cmd])
            .output()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn setup_tray<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "显示 NekoClaw", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let sep = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &settings_item, &sep, &quit_item])?;

    TrayIconBuilder::with_id("nekoclaw-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "settings" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = app.emit("navigate-to-settings", ());
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            setup_tray(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let win_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_accounts,
            save_account,
            delete_account,
            get_active_account_id,
            set_active_account_id,
            get_token,
            store_token_in_keychain_cmd,
            delete_token_from_keychain_cmd,
            inject_token_to_webview,
            get_autostart,
            set_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NekoClaw Desktop");
}
