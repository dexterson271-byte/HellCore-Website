import re

with open('app.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip_next = False

for i in range(len(lines)):
    if skip_next:
        skip_next = False
        continue
        
    line = lines[i]
    
    # Match if/elif/else/try/except/finally (excluding def to avoid double indenting)
    match = re.match(r'^(\s*)(if|elif|else|try|except|finally).*:(\s*)$', line)
    if match and i + 1 < len(lines):
        current_indent = len(match.group(1))
        next_line = lines[i+1]
        next_match = re.match(r'^(\s*)(\S.*)$', next_line)
        
        if next_match:
            next_indent = len(next_match.group(1))
            if next_indent <= current_indent:
                # Fix indentation
                new_lines.append(line)
                new_lines.append((' ' * (current_indent + 4)) + next_match.group(2) + '\n')
                print(f"Fixed line {i+2}: {new_lines[-1].strip()}")
                skip_next = True
                continue

    new_lines.append(line)

with open('app.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
