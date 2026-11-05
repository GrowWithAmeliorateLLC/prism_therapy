"""Add the Prism Therapy Google Tag Manager container (GTM-T5WCLKF5) to every page.

Idempotent: pages that already have the container are skipped.
Run from the repo root after rebuilding pages: python3 tools/inject_gtm.py
"""
import pathlib

GTM_ID = "GTM-T5WCLKF5"
HEAD = f"""<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){{w[l]=w[l]||[];w[l].push({{'gtm.start':
new Date().getTime(),event:'gtm.js'}});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
}})(window,document,'script','dataLayer','{GTM_ID}');</script>
<!-- End Google Tag Manager -->"""
BODY = f"""<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id={GTM_ID}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->"""

root = pathlib.Path(__file__).resolve().parent.parent
for page in sorted(root.rglob("*.html")):
    if ".git" in page.parts:
        continue
    t = page.read_text()
    if GTM_ID in t:
        continue
    t = t.replace("<head>", "<head>\n" + HEAD, 1).replace("<body>", "<body>\n" + BODY, 1)
    assert GTM_ID in t, page
    page.write_text(t)
    print("added GTM to", page.relative_to(root))
