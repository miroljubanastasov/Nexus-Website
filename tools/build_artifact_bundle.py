"""Build the self-contained bundle of floorplans.html that was published as a claude.ai Artifact.

Usage: python tools/build_artifact_bundle.py <out_dir>
The bundle needs vendored Bootstrap 5.3.3 and Font Awesome 6.5.0 in <out_dir>/vendor (the Artifact
viewer only allows stylesheets from Google Fonts), e.g.:
    npm pack bootstrap@5.3.3 @fortawesome/fontawesome-free@6.5.0
    copy dist/css/bootstrap.min.css, dist/js/bootstrap.bundle.min.js -> <out_dir>/vendor/
    copy css/all.min.css -> <out_dir>/vendor/fa/css/, webfonts/fa-solid-900.woff2 + fa-regular-400.woff2 -> <out_dir>/vendor/fa/webfonts/
    copy src/NEXUS LOGO_LOGO EXPORT.png -> <out_dir>/src/nexus-logo.png
Published at https://claude.ai/artifact/6GTu7DxmsV5jYnzWYF38WQ (private).
"""
import os, re, shutil, sys
SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
D = sys.argv[1]
shutil.rmtree(D + '/js', ignore_errors=True)
shutil.copytree(SRC + '/js', D + '/js')
for f in ['js/autosave.js', 'js/main.js']:
    if os.path.exists(D + '/' + f): os.remove(D + '/' + f)
for f in ['css/style.css', 'css/floorplans.css', 'assets/modules/module_library.json', 'assets/ml/configurator_data.json']:
    os.makedirs(os.path.dirname(D + '/' + f), exist_ok=True); shutil.copy(SRC + '/' + f, D + '/' + f)
s = open(SRC + '/floorplans.html').read()
head = s[s.index('<head>') + 6:s.index('</head>')]
body = s[s.index('<body class="fp-page">') + len('<body class="fp-page">'):s.index('</body>')]
head = re.sub(r'\s*<link[^>]*(bootstrap|font-awesome)[^>]*>', '', head)
head = re.sub(r'\s*<script async src="https://unpkg.com/es-module-shims[^>]*></script>', '', head)
head = re.sub(r'<meta charset[^>]*>|<meta name="viewport"[^>]*>', '', head)
head = re.sub(r'<title>.*?</title>', '', head)
top = '<title>Nexus Floor Plans</title>\n<link href="vendor/bootstrap.min.css" rel="stylesheet" />\n<link href="vendor/fa/css/all.min.css" rel="stylesheet" />\n'
extra = '''<style>
/* Single light theme (Bootstrap light), explicit page background */
:root { --page-bg: #ffffff; --page-fg: #212529; color-scheme: light; }
body { background: var(--page-bg); color: var(--page-fg); }
/* The artifact viewer blocks downloads: no Save project button here */
#exportProjectBtn { display: none !important; }
</style>
<script>document.body.classList.add('fp-page');</script>
'''
body = body.replace('src="src/NEXUS LOGO_LOGO EXPORT.png"', 'src="src/nexus-logo.png"')
body = re.sub(r'<li class="nav-item"><a class="nav-link" href="(index.html|brief.html|#)">.*?</a></li>\s*', '', body, flags=re.S)
body = body.replace('href="floorplans.html">Floor', 'href="#">Floor')
body = re.sub(r'<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"\s*crossorigin="anonymous"></script>', '<script src="vendor/bootstrap.bundle.min.js"></script>', body)
assert 'vendor/bootstrap.bundle.min.js' in body
open(D + '/floorplans-app.html', 'w').write(top + head.strip() + '\n' + extra + body)
print('ok')
