"""Patch: Replace loadEvents with anchor-button version."""
import re

FILE = r'templates/index.html'

NEW_FUNC = r"""    async function loadEvents() {
      const el = I('EVENT-BOX'); if (!el) return;
      try {
        const d = await API('/api/events');
        if (!d.length) {
          el.innerHTML = '<div class="p" style="text-align:center;color:var(--tx2);font-style:italic">No active events. Stay tuned!</div>';
          return;
        }

        const carousel = document.createElement('div');
        carousel.className = 'event-carousel';

        d.forEach(function(ev) {
          const lk = ev.link_url || '';
          const isExt = lk.startsWith('http') || lk.startsWith('//');

          const card = document.createElement('div');
          card.className = 'event-card';

          const title = document.createElement('div');
          title.className = 'event-card-title';
          title.textContent = ev.title;

          const desc = document.createElement('div');
          desc.className = 'event-card-desc';
          desc.textContent = ev.description;

          card.appendChild(title);
          card.appendChild(desc);

          if (lk) {
            if (isExt) {
              // External link: use a real <a> tag
              const btn = document.createElement('a');
              btn.className = 'btn bsm';
              btn.style.cssText = 'display:inline-block;margin-top:14px;text-decoration:none;';
              btn.href = lk;
              btn.target = '_blank';
              btn.rel = 'noopener noreferrer';
              btn.textContent = 'Learn More';
              card.appendChild(btn);
            } else {
              // Internal link: real <button>
              const btn = document.createElement('button');
              btn.className = 'btn bsm';
              btn.style.cssText = 'margin-top:14px;';
              btn.textContent = 'Learn More';
              btn.addEventListener('click', function(e) {
                e.stopPropagation();
                GO(lk.replace(/^\//, '').replace(/\//g, '-'));
              });
              card.appendChild(btn);
            }
          }

          carousel.appendChild(card);
        });

        el.innerHTML = '';
        el.appendChild(carousel);
      } catch(err) { el.innerHTML = ''; }
    }"""

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Find and replace the entire loadEvents function
pattern = r'    async function loadEvents\(\) \{.*?\n    \}'
match = re.search(pattern, content, re.DOTALL)

if match:
    print(f"Found at {match.start()}-{match.end()}")
    content = content[:match.start()] + NEW_FUNC + content[match.end():]
    with open(FILE, 'w', encoding='utf-8') as f:
        f.write(content)
    print("[OK] Patched successfully.")
else:
    print("[ERR] Pattern not found!")
