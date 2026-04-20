"""Patch: Inject comprehensive mobile CSS before </style> tag."""

FILE = r'templates/index.html'

MOBILE_CSS = """
    /* ═══════════════════════════════════════════════
       MOBILE RESPONSIVE — max-width: 768px
    ═══════════════════════════════════════════════ */
    @media (max-width: 768px) {

      /* Navbar */
      #NAV { padding: 0 12px; height: 56px; gap: 6px; }
      .nlogo-t { display: none; }
      .nlogo img { height: 36px; width: 36px; }
      .nlinks { gap: 2px; overflow-x: auto; scrollbar-width: none; }
      .nlinks::-webkit-scrollbar { display: none; }
      .nb { padding: 6px 10px; font-size: 0.78rem; }
      .srv { display: none; }

      /* Pages */
      .pg { padding: 76px 14px 48px; }

      /* Hero */
      .hero { padding: 24px 0 20px; text-align: center; }
      .hero h1 { font-size: clamp(2.4rem, 10vw, 4rem); }
      .hero-sub { font-size: 0.85rem; }
      .hero-ip { font-size: 0.9rem; padding: 8px 16px; }
      .hbtns { flex-direction: column; align-items: center; gap: 10px; }
      .hbtns .btn, .hbtns .bto { width: 100%; max-width: 280px; justify-content: center; }

      /* Content Width */
      .W, .Ws { padding: 0; }

      /* Event Cards */
      .event-carousel { gap: 12px; padding: 6px 2px; }
      .event-card { flex: 0 0 240px; padding: 16px; }

      /* Stats grids */
      .g2, .g3, .g4 { grid-template-columns: 1fr; }
      .scard-row { grid-template-columns: 1fr 1fr; }

      /* Section title */
      .stitle { font-size: 0.95rem; }

      /* Panels */
      .p { padding: 16px; border-radius: 12px; }

      /* Page Title */
      .ptitle { font-size: clamp(1.6rem, 7vw, 2.2rem); }

      /* Tabs */
      .tabs { gap: 6px; flex-wrap: wrap; }
      .tab { padding: 7px 12px; font-size: 0.78rem; }

      /* Admin tabs */
      #ADM-TABS { flex-wrap: wrap; gap: 4px; }
      #ADM-TABS button { font-size: 0.72rem; padding: 6px 10px; }

      /* Buttons */
      .btn, .bto { font-size: 0.82rem; padding: 9px 18px; }

      /* Forum layout */
      .f-layout { grid-template-columns: 1fr !important; }
      .f-row { grid-template-columns: 36px 1fr; gap: 8px; }
      .f-row .f-stats, .f-row .f-actions, .f-row .f-cat { display: none; }

      /* Forms */
      .fg label { font-size: 0.75rem; }
      .inp { font-size: 0.9rem; }

      /* Store */
      .mc { padding: 16px 12px; }

      /* Players / search */
      .bw-search-box { flex-wrap: wrap; gap: 6px; }
      .bw-search-btn { width: 100%; }

      /* Modal */
      .mdl { padding: 20px 16px; border-radius: 16px; margin: 12px; max-width: calc(100vw - 24px); }

      /* Table overflow */
      table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }

      /* Leaderboard */
      .lb-row { grid-template-columns: 28px 1fr 60px 60px; gap: 6px; font-size: 0.8rem; }

      /* Toast notifications */
      #TOASTS { right: 10px; left: 10px; max-width: 100%; }
      .toast { font-size: 0.82rem; }

      /* Announcement banner */
      #ANN { font-size: 0.78rem; padding: 8px 12px; }
    }

    /* ═══════════════════════════════════════════════
       SMALL MOBILE — max-width: 400px
    ═══════════════════════════════════════════════ */
    @media (max-width: 400px) {
      .nb { padding: 5px 7px; font-size: 0.72rem; }
      .event-card { flex: 0 0 200px; }
      .btn, .bto { padding: 8px 14px; font-size: 0.78rem; }
      .hero h1 { font-size: 2.2rem; }
    }
"""

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Inject before the closing </style> tag (before the font-awesome link)
TARGET = '  </style>\n  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome'

if TARGET in content:
    content = content.replace(TARGET, MOBILE_CSS + '  </style>\n  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome', 1)
    with open(FILE, 'w', encoding='utf-8') as f:
        f.write(content)
    print("[OK] Mobile CSS injected successfully.")
else:
    # Fallback: find </style> closing
    idx = content.rfind('  </style>')
    if idx != -1:
        content = content[:idx] + MOBILE_CSS + content[idx:]
        with open(FILE, 'w', encoding='utf-8') as f:
            f.write(content)
        print("[OK] Mobile CSS injected via fallback.")
    else:
        print("[ERR] Could not find injection point!")
