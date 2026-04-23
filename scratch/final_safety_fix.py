import re

with open('app.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for i in range(len(lines)):
    line = lines[i]
    new_lines.append(line)
    
    # Check if this line starts a block
    if re.match(r'^\s*(if|elif|else|try|except|finally).*:(\s*)$', line):
        current_indent = len(re.match(r'^\s*', line).group(0))
        # Check next non-empty line
        has_body = False
        for j in range(i + 1, len(lines)):
            next_line = lines[j]
            if next_line.strip() == "":
                continue
            next_indent = len(re.match(r'^\s*', next_line).group(0))
            if next_indent > current_indent:
                has_body = True
            break
        
        if not has_body:
            new_lines.append((' ' * (current_indent + 4)) + 'pass\n')
            print(f"Fixed empty block at line {i+1}")

with open('app.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
