src = open('backend/app/services/agent/context.py', encoding='utf-8').read()
lines = src.splitlines()

# Binary search for the problematic line
# We know lines 1-78 OK. Test adding lines one at a time
prefix = '\n'.join(lines[:78])  # ends with _TOOL_RULES_SUFFIX = (

for i in range(78, min(100, len(lines))):
    test = prefix + '\n' + lines[i] + '\n)'
    try:
        compile(test, 'test', 'exec')
        prefix = prefix + '\n' + lines[i]
        print(f'line {i+1}: OK -> {repr(lines[i][:60])}')
    except SyntaxError as e:
        print(f'line {i+1}: FAIL at {e.lineno},{e.offset}: {e.msg}')
        print(f'  content: {repr(lines[i][:100])}')
        break
