import ast
with open('backend/app/services/agent/context.py', encoding='utf-8') as f:
    src = f.read()
try:
    ast.parse(src)
    print('OK')
except SyntaxError as e:
    print(f'SyntaxError line {e.lineno}: {e.msg}')
    print(f'offset: {e.offset}')
    lines = src.splitlines()
    if e.lineno:
        print(f'line content: {repr(lines[e.lineno-1])}')
    # Show surrounding lines
    for i in range(max(0, e.lineno-4), min(len(lines), e.lineno+2)):
        print(f'  {i+1}: {repr(lines[i][:100])}')
