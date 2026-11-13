"""Real mouse-drag check for the Sources/Notes resize handles (API mocked).
Usage: python3 scripts/resize_drag_check.py [http://localhost:5191]  (vite dev server must be running)"""
import json, sys
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5191"
now = "2026-11-13T00:00:00Z"
subj = {"id":"s1","name":"Test","course_code":None,"description":None,"is_archived":False,"settings":{"response_length":"default","response_style":"general"},"created_at":now,"updated_at":now,"source_count":2}
def src(i,t): return {"id":i,"subject_id":"s1","user_id":"u","title":t,"file_name":t,"source_type":"pdf","status":"ready","page_count":2,"word_count":100,"version":1,"created_at":now,"updated_at":now}
sources=[src("a","Abhay Partap Singh Resume Final Version.pdf"),src("b","Lecture notes week 3.pdf")]
notes=[{"id":"n1","subject_id":"s1","user_id":"u","title":"A note","content":"<p>hi</p>","is_saved_answer":False,"citations":[],"created_at":now,"updated_at":now}]
def handler(route):
    u=route.request.url; p=u.split("localhost:8000")[1].split("?")[0] if "localhost:8000" in u else ""
    body={}
    if p.endswith("/guest-session") or p.endswith("/login"): body={"token":"t","user":{"id":"u","email":"g@x","is_guest":True}}
    elif p.endswith("/auth/me"): body={"id":"u","email":"g@x","is_guest":True}
    elif p=="/subjects": body=[subj]
    elif p=="/subjects/s1": body=subj
    elif p.endswith("/sources"): body=sources
    elif p.endswith("/notes"): body=notes
    elif p.endswith("/conversations"): body=[]
    elif p=="/health": body={"status":"ok"}
    elif "starter" in p: body=[]
    else: body=[]
    route.fulfill(status=200,content_type="application/json",headers={"access-control-allow-origin":"*"},body=json.dumps(body))
def w(page,sel): return page.evaluate("s=>{const e=document.querySelector(s);return e?e.getBoundingClientRect().width:null}",sel)
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={"width":1440,"height":900}); page=ctx.new_page()
    page.route("**/localhost:8000/**",handler)
    page.add_init_script("localStorage.setItem('notebookspace_token','t')")
    page.goto(URL+"/subject/s1"); page.wait_for_timeout(2500)
    print("sources-panel",w(page,".sources-panel"),"study-panel",w(page,".study-panel"))
    for side,dx in (("left",80),("right",-80)):
        h=page.locator(f".panel-resize-{side}").first
        bb=h.bounding_box(); print(side,"handle",bb)
        if not bb: continue
        x=bb["x"]+bb["width"]/2; y=bb["y"]+bb["height"]/2
        before=(w(page,".sources-panel"),w(page,".study-panel"))
        page.mouse.move(x,y); page.mouse.down(); page.mouse.move(x+dx/2,y,steps=5); page.mouse.move(x+dx,y,steps=5); page.mouse.up(); page.wait_for_timeout(500)
        after=(w(page,".sources-panel"),w(page,".study-panel"))
        print(side,"before",before,"after",after)
        if side=="left": assert 355<=after[0]<=365 and after[0]-before[0]>=70, after
        else: assert after[1]-before[1]>=70, after
    print("PASS")
    b.close()
