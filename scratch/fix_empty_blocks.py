import re

with open('app.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip_next = False

for i in range(len(lines)):
    line = lines[i]
    
    # Match block starters: if, elif, else, try, except, finally
    match = re.match(r'^(\s*)(if|elif|else|try|except|finally).*:(\s*)$', line)
    if match:
        current_indent = len(match.group(1))
        # Look ahead for the first non-empty line
        found_body = False
        for j in range(i + 1, len(lines)):
            next_line = lines[j]
            if next_line.strip() == "":
                continue
            next_match = re.match(r'^(\s*)(\S.*)$', next_line)
            if next_match:
                next_indent = len(next_match.group(1))
                if next_indent > current_indent:
                    found_body = True
                break
        
        if not found_body:
            # Block is empty or next content is not indented
            # Add a 'pass' statement
            new_lines.append(line)
            new_lines.append((' ' * (current_indent + 4)) + 'pass\n')
            print(f"Added pass to empty block at line {i+1}")
            continue

    new_lines.append(line)

with open('app.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
