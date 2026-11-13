"""Asserts the Sources right-edge controls share one centerX (<=0.5px). Needs vite on :5191."""
import sys
exec(open(__file__.replace('align_check','resize_drag_check')).read().split("def w(page")[0])
JS="""()=>{const cx=e=>{const r=e.getBoundingClientRect();return +((r.left+r.right)/2).toFixed(2)};
const p=document.querySelector('.sources-panel');const o={};
o.panelRight=p.getBoundingClientRect().right;
o.collapse=cx(p.querySelector('.sources-panel-header svg'));
o.add=cx([...p.querySelectorAll('button')].find(b=>/add|\\+/i.test(b.getAttribute('aria-label')||'')).querySelector('svg'));
const cbs=[...p.querySelectorAll('input[type=checkbox]')];
o.checkboxes=cbs.map(cx);
o.html=[...p.querySelectorAll('input[type=checkbox]')][0].parentElement.outerHTML.slice(0,300);
return o}"""
with sync_playwright() as pw:
    b=pw.chromium.launch(); page=b.new_context(viewport={"width":1440,"height":900}).new_page()
    page.route("**/localhost:8000/**",handler)
    page.add_init_script("localStorage.setItem('notebookspace_token','t')")
    page.goto(URL+"/subject/s1"); page.wait_for_timeout(2500)
    r=page.evaluate(JS); print(r)
    pr=r["panelRight"]
    xs=[r['collapse'],r['add']]+r['checkboxes']
    assert max(xs)-min(xs)<=0.5, xs
    print('PASS',xs)
    b.close()
