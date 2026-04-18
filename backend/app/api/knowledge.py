"""
Knowledge base file upload / list / delete API.
Files stored at storage/{user_id}/knowledge/.
"""
import os
import re
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import JSONResponse

from app.core.deps import get_current_user
from app.models.user import User
from app.services.knowledge import (
    _user_kb_dir,
    index_file,
    remove_file_index,
    list_files,
    has_index,
    SUPPORTED_EXTS,
)

router = APIRouter(prefix="/knowledge", tags=["knowledge"])

_SAFE_FILENAME = re.compile(r"^[\w\-. ]+$")
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    if not file.filename:
        return JSONResponse(status_code=400, content={"error": "文件名不能为空"})

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in SUPPORTED_EXTS:
        return JSONResponse(
            status_code=400,
            content={"error": f"不支持的文件类型: {ext}，仅支持 {', '.join(SUPPORTED_EXTS)}"},
        )

    # Sanitize filename
    safe_name = Path(file.filename).name
    if not _SAFE_FILENAME.match(safe_name):
        return JSONResponse(status_code=400, content={"error": "文件名包含非法字符"})

    kb_dir = _user_kb_dir(user.id)
    dest = os.path.join(kb_dir, safe_name)

    # Read and check size
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        return JSONResponse(status_code=400, content={"error": "文件大小超过 50 MB 限制"})

    with open(dest, "wb") as f:
        f.write(data)

    chunks = await index_file(user.id, dest)
    return {"ok": True, "filename": safe_name, "chunks": chunks}


@router.get("/files")
async def get_files(user: User = Depends(get_current_user)):
    files = list_files(user.id)
    return {"files": files}


@router.delete("/files/{filename}")
async def delete_file(
    filename: str,
    user: User = Depends(get_current_user),
):
    if not _SAFE_FILENAME.match(filename):
        return JSONResponse(status_code=400, content={"error": "非法文件名"})

    kb_dir = _user_kb_dir(user.id)
    fpath = os.path.join(kb_dir, filename)

    # Prevent path traversal
    if not os.path.abspath(fpath).startswith(os.path.abspath(kb_dir)):
        return JSONResponse(status_code=400, content={"error": "非法路径"})

    if not os.path.isfile(fpath):
        return JSONResponse(status_code=404, content={"error": "文件不存在"})

    os.remove(fpath)
    remove_file_index(user.id, filename)
    return {"ok": True}


@router.get("/status")
async def get_status(user: User = Depends(get_current_user)):
    return {"hasIndex": has_index(user.id)}
