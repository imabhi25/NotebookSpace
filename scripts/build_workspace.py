import os

html_content = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>NotebookSpace · Subject-Adaptive Study Workspace</title>
<style>
/* -------------------------------------------------------------
   Google NotebookLM Design Tokens & Surface Hierarchy
------------------------------------------------------------- */
:root {
  --bg: #f0f4f9;
  --rail: #ffffff;
  --paper: #ffffff;
  --ink: #1f1f1f;
  --muted: #5f6368;
  --line: #e3e8ef;
  --soft: #f8fafd;
  --accent: #0b57d0;
  --tint: #e8f0fe;
  --mark: #fef08a;
  --shadow: 0 1px 3px rgba(0,0,0,0.04);
}

body.dark {
  --bg: #131314;
  --rail: #1e1f20;
  --paper: #1e1f20;
  --ink: #e3e3e3;
  --muted: #9aa0a6;
  --line: #2d2e30;
  --soft: #282a2c;
  --accent: #a8c7fa;
  --tint: #1f3760;
  --mark: #423813;
  --shadow: 0 2px 8px rgba(0,0,0,0.4);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  color: var(--ink);
  background: var(--bg);
  font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

button, input, textarea { font: inherit; color: inherit; }
button { cursor: pointer; border: 0; background: none; }
button:focus-visible, input:focus-visible, textarea:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.65;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}
button { border-radius: 8px; transition: background .12s, color .12s, border-color .12s; }
button:disabled { opacity: .35; cursor: default; }
.icon { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; color: var(--muted); }
.icon:hover { background: var(--soft); color: var(--ink); }
.mini-icon { width: 28px; height: 28px; }
.inline { display: inline-flex; align-items: center; gap: 7px; }
.muted { color: var(--muted); }
.small { font-size: 12px; }

/* -------------------------------------------------------------
   Top App Bar (NotebookLM Minimal Chrome)
------------------------------------------------------------- */
.topbar {
  height: 56px;
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
  z-index: 10;
}
.breadcrumbs { display: flex; align-items: center; gap: 10px; font-size: 13.5px; }
.brand { font-weight: 600; font-size: 15.5px; letter-spacing: -.3px; display: flex; align-items: center; gap: 9px; color: var(--ink); padding: 4px 6px; border-radius: 8px; }
.brand:hover { background: rgba(0,0,0,0.03); }
.brandmark { width: 26px; height: 26px; background: var(--accent); color: #ffffff; border-radius: 6px; display: grid; place-items: center; }
.brandmark svg { width: 16px; height: 16px; }
.slash { color: var(--muted); opacity: .5; font-size: 14px; }
.subject-dropdown {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--paper);
  border: 1px solid var(--line);
  font-weight: 500;
  font-size: 13px;
  color: var(--ink);
  transition: all .12s ease;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}
.subject-dropdown:hover {
  background: var(--soft);
  border-color: var(--accent);
}
.dropdown-chevron { width: 13px; height: 13px; color: var(--muted); }
.topright { display: flex; align-items: center; gap: 10px; }
.avatar { background: #c2e7ff; color: #001d35; border-radius: 50%; width: 32px; height: 32px; display: grid; place-items: center; font-size: 12.5px; font-weight: 600; }
body.dark .avatar { background: #004a77; color: #c2e7ff; }

/* -------------------------------------------------------------
   Main 3-Column Workspace Container (NotebookLM 3-Card Architecture)
------------------------------------------------------------- */
.workspace {
  height: calc(100dvh - 56px);
  padding: 0 16px 16px 16px;
  background: var(--bg);
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 440px;
  gap: 16px;
  box-sizing: border-box;
  overflow: hidden;
}
@media (min-width: 1440px) {
  .workspace { grid-template-columns: 300px minmax(0, 1fr) 480px; }
}
.workspace.left-off { grid-template-columns: 0 minmax(0, 1fr) 440px; }
@media (min-width: 1440px) {
  .workspace.left-off { grid-template-columns: 0 minmax(0, 1fr) 480px; }
}
.workspace.right-off { grid-template-columns: 280px minmax(0, 1fr) 0; }
@media (min-width: 1440px) {
  .workspace.right-off { grid-template-columns: 300px minmax(0, 1fr) 0; }
}
.workspace.left-off.right-off { grid-template-columns: 0 minmax(0, 1fr) 0; }

/* Card Panels: Full-Height Rounded Floating Cards */
.left, .center, .right {
  background: var(--paper);
  border-radius: 24px;
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}
.left-off .left, .right-off .right { visibility: hidden; }

/* -------------------------------------------------------------
   LEFT PANEL: "Sources" Card
------------------------------------------------------------- */
.panelhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 20px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.leftbody {
  padding: 8px 12px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.add {
  width: calc(100% - 8px);
  height: 40px;
  border: 1px solid var(--line);
  background: var(--soft);
  justify-content: center;
  margin: 6px 4px 10px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 999px;
  color: var(--accent);
  transition: all .15s ease;
}
.add:hover { background: var(--tint); border-color: var(--accent); }
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--line);
  background: var(--soft);
  padding: 8px 12px;
  border-radius: 999px;
  margin: 0 4px 10px;
}
.search svg { width: 14px; color: var(--muted); }
.search input { border: 0; outline: 0!important; background: transparent; min-width: 0; width: 100%; font-size: 12.5px; }
.selection {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 8px;
  color: var(--muted);
  font-size: 11.5px;
}
.selection button { font-size: 11.5px; color: var(--accent); font-weight: 500; }
#sourcelist { flex: 1; overflow-y: auto; }
.source {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  margin: 3px 0;
  transition: background .12s;
}
.source:hover { background: var(--soft); }
input[type=checkbox] {
  accent-color: var(--accent);
  width: 15px;
  height: 15px;
  cursor: pointer;
  margin: 0;
  flex-shrink: 0;
}
.fileicon {
  width: 28px;
  height: 32px;
  color: var(--accent);
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--paper);
  flex-shrink: 0;
}
.fileicon svg { width: 15px; height: 15px; }
.sourceinfo { flex: 1; min-width: 0; }
.sourcetitle { font-size: 13px; display: block; text-align: left; padding: 0; width: 100%; line-height: 1.4; font-weight: 500; }
.sourceinfo small { display: block; color: var(--muted); font-size: 11px; margin-top: 2px; }
.source.empty { font-size: 12.5px; color: var(--muted); padding: 16px 8px; text-align: center; }
.sectionhead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--line);
  padding-top: 14px;
  margin-top: 16px;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .5px;
  padding-left: 6px;
  padding-right: 6px;
}
.conversation {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  text-align: left;
  font-size: 12.5px;
  color: var(--muted);
  margin: 2px 0;
  border-radius: 10px;
  border: 1px solid transparent;
}
.conversation svg { width: 14px; height: 14px; }
.conversation:hover { background: var(--soft); color: var(--ink); }
.conversation.active { background: var(--soft); color: var(--ink); font-weight: 550; }
.conversation span { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* -------------------------------------------------------------
   CENTER PANEL: "Chat" Card
------------------------------------------------------------- */
.chathead {
  height: 52px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
}
.chattitle { font-weight: 600; font-size: 15px; color: var(--ink); }
.showleft { display: none; }
.left-off .showleft { display: inline-flex; }
.tool-mount-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--tint);
  color: var(--accent);
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid transparent;
  white-space: nowrap;
}

/* Message Stream */
.thread { overflow-y: auto; flex: 1; scroll-behavior: smooth; }
.threadinner { max-width: 760px; margin: 0 auto; padding: 24px 32px 28px; }
.user {
  margin-left: auto;
  background: var(--soft);
  border: none;
  border-radius: 20px 20px 4px 20px;
  padding: 12px 18px;
  max-width: 75%;
  line-height: 1.6;
  font-size: 14.5px;
  color: var(--ink);
}
.answer { margin-top: 24px; font-size: 15px; line-height: 1.7; letter-spacing: -.1px; }
.assistantlabel { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--muted); margin-bottom: 12px; font-weight: 500; }
.spark { color: var(--accent); width: 16px; height: 16px; }
.answer p { margin: 10px 0 14px; }
.answer h2 { font-size: 19px; font-weight: 600; line-height: 1.4; letter-spacing: -.4px; margin: 10px 0 14px; }
.answer h3 { font-size: 14.5px; line-height: 1.5; margin: 16px 0 8px; font-weight: 650; }
.cite {
  display: inline-flex;
  background: var(--tint);
  color: var(--accent);
  border: none;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  vertical-align: middle;
  padding: 1px 7px;
  margin: 0 2px;
  cursor: pointer;
  transition: all .12s;
}
.cite:hover, .cite.active { background: var(--accent); color: #ffffff; }
.equation {
  font-family: Georgia, serif;
  font-size: 16px;
  background: var(--soft);
  border: 1px solid var(--line);
  padding: 14px 18px;
  margin: 16px 0;
  border-radius: 12px;
  line-height: 1.6;
  overflow-x: auto;
}
.actions { display: flex; align-items: center; gap: 8px; margin-top: 18px; flex-wrap: wrap; }
.open-lab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--tint);
  color: var(--accent);
  font-weight: 500;
  font-size: 12px;
  padding: 6px 14px;
  border: none;
  border-radius: 999px;
  transition: all .15s ease;
  cursor: pointer;
}
.open-lab-btn:hover { opacity: .88; transform: translateY(-1px); }
.open-lab-btn svg { width: 14px; height: 14px; color: var(--accent); }
.pill-btn {
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  background: transparent;
  color: var(--muted);
  border: 1px solid var(--line);
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.pill-btn:hover { background: var(--soft); color: var(--ink); }
.followups { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 18px; }
.followups button { font-size: 11.5px; padding: 6px 12px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); background: var(--soft); }
.followups button:hover { color: var(--accent); border-color: var(--accent); }

/* Floating Pill Composer (NotebookLM Signature) */
.composerwrap {
  flex-shrink: 0;
  padding: 12px 24px 16px;
  background: var(--paper);
}
.composer {
  max-width: 760px;
  margin: auto;
  border: 1px solid var(--line);
  border-radius: 28px;
  padding: 6px 8px 6px 20px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.03);
  background: var(--soft);
  display: flex;
  align-items: center;
  gap: 12px;
  transition: border-color .15s, box-shadow .15s;
}
.composer:focus-within {
  border-color: var(--accent);
  box-shadow: 0 2px 12px rgba(11,87,208,0.08);
}
.composer textarea {
  display: block;
  flex: 1;
  resize: none;
  border: 0;
  outline: 0!important;
  background: transparent;
  font-size: 14px;
  line-height: 1.5;
  min-height: 24px;
  max-height: 120px;
  padding: 4px 0;
  color: var(--ink);
}
.composerbottom { display: flex; align-items: center; gap: 8px; }
.scope {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--muted);
  padding: 4px 6px;
  background: transparent;
  border: none;
  cursor: pointer;
}
.scope svg { width: 12px; height: 12px; }
.send {
  border-radius: 50%;
  height: 36px;
  width: 36px;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: #ffffff;
  transition: opacity .12s, transform .12s;
  border: none;
  flex-shrink: 0;
}
.send:hover { opacity: .9; transform: scale(1.04); }
.send svg { width: 16px; height: 16px; }
body.dark .send {
  background: #a8c7fa;
  color: #041e49;
}
.disclaimer { text-align: center; color: var(--muted); font-size: 11px; margin-top: 6px; }

/* -------------------------------------------------------------
   RIGHT PANEL: "Studio" Single Full-Height Card
------------------------------------------------------------- */
.right {
  height: 100%;
}
.workbench-head {
  height: 52px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}
.benchtabs {
  display: flex;
  gap: 4px;
  background: var(--soft);
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--line);
}
.benchtab {
  font-size: 12px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 999px;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all .15s ease;
  border: none;
}
.benchtab:hover { color: var(--ink); }
.benchtab.selected {
  background: var(--paper);
  color: var(--accent);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.benchtab svg { width: 14px; height: 14px; }
.dock-badge {
  font-size: 10px;
  background: var(--tint);
  color: var(--accent);
  padding: 1px 6px;
  border-radius: 999px;
  font-weight: 600;
}
.workbench-body {
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Studio Tab Views */
#workbench-lab-view, #workbench-passage-view {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.lab-subheader {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}
.eyebrow { font-size: 10.5px; letter-spacing: .8px; color: var(--muted); text-transform: uppercase; font-weight: 600; }
.documenttitle { font-size: 14px; font-weight: 600; line-height: 1.45; margin: 6px 0 2px; }
.docmeta { font-size: 11px; color: var(--muted); }
.pagebar { display: flex; align-items: center; justify-content: space-between; margin: 16px 0 10px; font-size: 11.5px; color: var(--muted); }
.pagebar button { height: 26px; width: 26px; }
.paper {
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 22px 20px;
  font-family: Georgia, serif;
  font-size: 13px;
  line-height: 1.85;
}
.paper .coursecode { font: 9px -apple-system, sans-serif; letter-spacing: 1.5px; color: var(--muted); padding-bottom: 10px; border-bottom: 1px solid var(--line); margin-bottom: 14px; font-weight: 600; }
.paper h3 { font-size: 16.5px; line-height: 1.4; font-weight: normal; margin: 0 0 12px; }
.paper p { margin: 10px 0; }
.paper mark { background: var(--mark); color: var(--ink); padding: 2px 4px; border-radius: 4px; }
.pagenum { text-align: center; font: 9px -apple-system, sans-serif; color: var(--muted); margin-top: 18px; }
.passagehint { font-size: 11px; color: var(--muted); margin: 12px 0 16px; display: flex; align-items: center; gap: 6px; }
.passagehint i { height: 8px; width: 8px; background: var(--mark); border: 1px solid var(--line); border-radius: 2px; }
.savepassage {
  border: 1px solid var(--line);
  background: var(--soft);
  color: var(--accent);
  width: 100%;
  justify-content: center;
  padding: 9px;
  font-size: 12.5px;
  font-weight: 500;
  border-radius: 999px;
}
.savepassage:hover { background: var(--tint); border-color: var(--accent); }

/* Notes Studio View (.notes-dock-card) */
.notes-dock-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  padding: 20px;
}
.notes-dock-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.notes-dock-title {
  font-size: 13.5px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.add-note-btn {
  font-size: 12px;
  font-weight: 500;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--soft);
  border: 1px solid var(--line);
  color: var(--accent);
}
.add-note-btn:hover { background: var(--tint); border-color: var(--accent); }
.quick-scratchpad { margin-bottom: 12px; }
.scratchpad-input {
  width: 100%;
  padding: 9px 14px;
  font-size: 12.5px;
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--ink);
  transition: border-color .15s, background .15s;
}
.scratchpad-input:focus {
  background: var(--paper);
  border-color: var(--accent);
}
.dock-notes-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  flex: 1;
}
.notecard {
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 14px 16px;
  transition: all .15s ease;
}
.notecard:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  border-color: var(--line);
}
.notecard-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.notecard-head h4 {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
  color: var(--ink);
}
.notecard p {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
  margin: 0 0 8px;
}
.notecard-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--muted);
}
.mini-link {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  color: var(--accent);
  background: var(--tint);
  border: none;
}
.mini-link:hover { opacity: .85; }

/* -------------------------------------------------------------
   Domain Tool UI Components (CS, Math, Physics, Chem, Bio)
------------------------------------------------------------- */
.domain-widget { background: transparent; border: 0; padding: 0; margin: 0; color: var(--ink); }
.widget-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--line); margin-bottom: 14px; }
.widget-title { font-size: 13px; font-weight: 650; display: flex; align-items: center; gap: 7px; letter-spacing: -.2px; }
.widget-badge { font-size: 10px; font-weight: 650; padding: 3px 8px; border-radius: 999px; background: var(--soft); color: var(--ink); border: 1px solid var(--line); text-transform: uppercase; letter-spacing: .5px; }
.widget-badge.status-warn { background: #fff8e1; color: #b45309; border-color: #ffecb3; }
.widget-badge.status-ok { background: #e8f5e9; color: #1b5e20; border-color: #c8e6c9; }
.widget-badge.status-term { background: #e3f2fd; color: #0d47a1; border-color: #bbdefb; }
.widget-ctrls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ctrl-btn { font-size: 11.5px; font-weight: 500; padding: 5px 10px; border: 1px solid var(--line); background: var(--soft); border-radius: 999px; display: inline-flex; align-items: center; gap: 5px; color: var(--ink); }
.ctrl-btn:hover { background: var(--tint); border-color: var(--accent); color: var(--accent); }
.ctrl-btn.active { background: var(--accent); color: #ffffff; border-color: var(--accent); }

/* CS Tracer */
.tracer-code { background: var(--soft); border: 1px solid var(--line); border-radius: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.7; padding: 12px 0; overflow-x: auto; margin-bottom: 14px; }
.code-line { padding: 3px 14px; display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; transition: background .1s; }
.code-line:hover { background: rgba(0,0,0,0.03); }
.code-line.active { background: var(--tint); color: var(--accent); font-weight: 600; border-left: 3px solid var(--accent); padding-left: 11px; }
.code-line .lineno { color: var(--muted); width: 16px; text-align: right; font-size: 11px; }
.code-line .linearrow { width: 10px; font-size: 10px; color: var(--accent); }
.array-container { margin: 14px 0; }
.array-strip { display: flex; gap: 8px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
.array-cell { width: 52px; height: 52px; border: 1px solid var(--line); background: var(--paper); border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; transition: all .15s; }
.array-cell .val { font-size: 15px; font-weight: 650; }
.array-cell .idx { font-size: 10px; color: var(--muted); margin-top: 1px; }
.array-cell.in-boundary { background: var(--tint); border-color: var(--accent); }
.array-cell.active-idx { border-color: var(--accent); background: var(--mark); transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,0.06); }
.array-cell.active-idx::before { content: "i ▼"; position: absolute; top: -17px; font-size: 9.5px; font-weight: 700; color: var(--accent); }
.boundary-legend { font-size: 11px; color: var(--muted); margin-top: 6px; display: flex; gap: 12px; align-items: center; }
.boundary-legend span { display: inline-flex; align-items: center; gap: 5px; }
.boundary-dot { width: 8px; height: 8px; border-radius: 2px; background: var(--tint); border: 1px solid var(--accent); }
.var-pills { display: flex; gap: 6px; flex-wrap: wrap; margin: 12px 0; }
.var-pill { background: var(--soft); border: 1px solid var(--line); padding: 4px 9px; border-radius: 8px; font-size: 11px; display: inline-flex; align-items: center; gap: 5px; }
.var-pill strong { font-family: monospace; color: var(--accent); }
.proof-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 14px; font-size: 11.5px; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.proof-table th { background: var(--soft); padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--line); color: var(--muted); font-weight: 600; }
.proof-table td { padding: 8px 10px; border-bottom: 1px solid var(--line); line-height: 1.45; background: var(--paper); }
.proof-table tr:last-child td { border-bottom: 0; }
.proof-table tr.active-proof td { background: var(--tint); font-weight: 550; }
.proof-table tr.active-proof td:first-child { color: var(--accent); font-weight: 700; }

/* Math Unfolder & Unified Curve */
.math-unfolder { margin-bottom: 16px; }
.deriv-step { border: 1px solid var(--line); border-radius: 14px; margin-bottom: 10px; background: var(--soft); overflow: hidden; }
.deriv-head { padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; background: var(--paper); gap: 8px; }
.deriv-expr { font-family: Georgia, serif; font-size: 14px; }
.unfold-btn { font-size: 11px; color: var(--accent); background: var(--tint); border: none; padding: 4px 9px; border-radius: 999px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; }
.unfold-btn:hover { opacity: .85; }
.deriv-drawer { padding: 12px 14px; font-size: 12px; line-height: 1.65; border-top: 1px solid var(--line); background: var(--soft); }
.deriv-drawer strong { color: var(--accent); }
.math-tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--line); padding-bottom: 10px; margin-bottom: 12px; overflow-x: auto; }
.math-tab { font-size: 11px; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); background: var(--soft); white-space: nowrap; }
.math-tab.active { background: var(--accent); color: #ffffff; border-color: var(--accent); font-weight: 600; }
.svg-canvas-box { width: 100%; height: 210px; background: var(--soft); border: 1px solid var(--line); border-radius: 16px; position: relative; overflow: hidden; }
.svg-canvas-box svg { width: 100%; height: 100%; }
.slider-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 12px; }
.slider-group { display: flex; flex-direction: column; gap: 4px; }
.slider-group label { font-size: 11px; color: var(--muted); display: flex; justify-content: space-between; }
.slider-group label span { color: var(--ink); font-weight: 600; }
.slider-group input[type=range] { accent-color: var(--accent); width: 100%; cursor: pointer; }
.metric-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.metric-chip { background: var(--soft); border: 1px solid var(--line); border-radius: 10px; padding: 6px 10px; font-size: 11px; flex: 1; min-width: 110px; }
.metric-chip small { display: block; color: var(--muted); font-size: 10px; }
.metric-chip strong { font-size: 12.5px; color: var(--ink); margin-top: 2px; display: block; }

/* Physics Incline Lab */
.physics-layout { display: flex; flex-direction: column; gap: 12px; margin-top: 10px; }
.physics-svg-box { background: var(--soft); border: 1px solid var(--line); border-radius: 16px; height: 220px; position: relative; }
.physics-svg-box svg { width: 100%; height: 100%; }
.eq-box { background: var(--soft); border: 1px solid var(--line); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 6px; font-size: 11.5px; }
.eq-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px dashed var(--line); }
.eq-row:last-child { border-bottom: 0; }
.eq-row code { font-family: Georgia, serif; font-size: 12px; }
.eq-row strong { color: var(--accent); }

/* Chem 2D Molecule & Mechanism */
.chem-stages { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.chem-stage-btn { font-size: 11px; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--soft); color: var(--muted); }
.chem-stage-btn.active { background: var(--accent); color: #ffffff; border-color: var(--accent); font-weight: 600; }
.chem-svg-box { background: var(--soft); border: 1px solid var(--line); border-radius: 16px; height: 210px; position: relative; }
.chem-svg-box svg { width: 100%; height: 100%; }
.chem-atoms { display: flex; gap: 6px; margin: 10px 0; flex-wrap: wrap; }
.chem-atom-btn { font-size: 11px; padding: 4px 9px; border-radius: 999px; border: 1px solid var(--line); background: var(--soft); color: var(--ink); }
.chem-atom-btn.active { background: var(--mark); border-color: var(--accent); font-weight: 600; }
.chem-inspect { background: var(--soft); border: 1px solid var(--line); border-radius: 16px; padding: 12px; font-size: 11.5px; line-height: 1.6; }
.chem-inspect-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-top: 8px; }
.chem-item { background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
.chem-item small { color: var(--muted); display: block; font-size: 10px; }
.chem-item strong { color: var(--ink); font-size: 12px; }

/* Bio Pathway Map */
.bio-toggle-bar { display: flex; justify-content: space-between; align-items: center; background: var(--soft); border: 1px solid var(--line); padding: 8px 12px; border-radius: 12px; margin-bottom: 12px; }
.bio-toggle-label { font-size: 11.5px; font-weight: 600; display: flex; align-items: center; gap: 7px; }
.switch { position: relative; display: inline-block; width: 34px; height: 18px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider-switch { position: absolute; cursor: pointer; inset: 0; background-color: #d4d4d8; border-radius: 20px; transition: .2s; }
.slider-switch:before { position: absolute; content: ""; height: 12px; width: 12px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .2s; }
input:checked + .slider-switch { background-color: #c84b31; }
input:checked + .slider-switch:before { transform: translateX(16px); }
.bio-map-box { background: var(--soft); border: 1px solid var(--line); border-radius: 16px; height: 220px; position: relative; overflow: hidden; }
.bio-map-box svg { width: 100%; height: 100%; }
.bio-stages-bar { display: flex; gap: 6px; margin: 10px 0; flex-wrap: wrap; }
.bio-stage-pill { font-size: 11px; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--soft); cursor: pointer; }
.bio-stage-pill.active { background: var(--accent); color: #ffffff; border-color: var(--accent); font-weight: 600; }
.bio-detail-card { background: var(--soft); border: 1px solid var(--line); border-radius: 16px; padding: 12px; font-size: 11.5px; line-height: 1.6; }
.bio-detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-top: 8px; }
.bio-card-item { background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; }
.bio-card-item small { color: var(--muted); display: block; font-size: 10px; }
.bio-card-item strong { color: var(--accent); font-size: 12px; }

/* Modal & Toast */
.error { margin: 16px 0; padding: 12px; border: 1px solid #fecaca; border-radius: 12px; color: #991b1b; background: #fef2f2; font-size: 12px; }
.error button { font-weight: 600; text-decoration: underline; margin-left: 5px; }
.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: var(--ink); color: var(--paper); padding: 10px 18px; border-radius: 999px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); z-index: 50; font-size: 12.5px; display: none; font-weight: 500; }
.toast.on { display: block; }
.modalback { position: fixed; inset: 0; background: rgba(0,0,0,0.35); backdrop-filter: blur(4px); display: grid; place-items: center; z-index: 30; padding: 20px; }
.modalback[hidden] { display: none; }
.modal { background: var(--paper); border: 1px solid var(--line); border-radius: 20px; width: min(520px, 100%); padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.12); }
.modalhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.modalhead h2 { font-size: 17px; font-weight: 600; margin: 0; letter-spacing: -.3px; }
.modal p { font-size: 12.5px; color: var(--muted); line-height: 1.6; }
.modal input, .modal textarea { width: 100%; background: var(--soft); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin: 6px 0; }
.modal textarea { height: 120px; resize: vertical; }
.primary { background: var(--accent); color: #ffffff; padding: 9px 16px; display: inline-flex; gap: 6px; align-items: center; font-size: 12.5px; font-weight: 500; border-radius: 999px; border: none; }
.primary:hover { opacity: .9; }
.dropzone { border: 1px dashed var(--line); border-radius: 14px; padding: 20px; text-align: center; margin-top: 16px; background: var(--soft); }
.dropzone input { padding: 0; border: 0; background: none; font-size: 11px; }
.result { padding: 9px 12px; border-bottom: 1px solid var(--line); font-size: 12.5px; display: flex; gap: 9px; align-items: center; border-radius: 8px; }
.result:hover { background: var(--soft); }
.result small { font-size: 10.5px; color: var(--muted); margin-left: auto; }
.searchresults { max-height: 280px; overflow-y: auto; margin-top: 10px; }
.notebooks { display: grid; gap: 10px; }
.notebookbutton { text-align: left; padding: 14px 16px; border: 1px solid var(--line); background: var(--soft); border-radius: 14px; position: relative; transition: all .12s; }
.notebookbutton:hover { background: var(--tint); border-color: var(--accent); }
.notebookbutton.active-subject { border-color: var(--accent); background: var(--tint); }
.notebookbutton strong, .notebookbutton small { display: block; }
.notebookbutton strong { color: var(--ink); }
.notebookbutton small { margin-top: 5px; font-size: 11.5px; color: var(--muted); }
.notebookbutton .subbadge { position: absolute; top: 14px; right: 14px; background: var(--accent); color: #ffffff; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 999px; }

/* -------------------------------------------------------------
   Dark Mode Overrides
------------------------------------------------------------- */
body.dark .user { background: var(--soft); color: var(--ink); }
body.dark .composer { background: var(--soft); border-color: var(--line); }
body.dark .notecard { background: var(--soft); border-color: var(--line); }
body.dark .paper { background: var(--soft); border-color: var(--line); }
body.dark .benchtabs { background: #131314; border-color: var(--line); }
body.dark .benchtab.selected { background: var(--soft); color: var(--accent); }
body.dark .primary, body.dark .send { background: var(--accent); color: #041e49; }
body.dark .open-lab-btn { background: var(--tint); color: var(--accent); }
body.dark .cite { background: var(--tint); color: var(--accent); }
body.dark .tracer-code, body.dark .deriv-step, body.dark .svg-canvas-box, body.dark .physics-svg-box, body.dark .eq-box, body.dark .chem-svg-box, body.dark .chem-inspect, body.dark .bio-map-box, body.dark .bio-detail-card, body.dark .bio-toggle-bar { background: var(--soft); border: 1px solid var(--line); }
body.dark .deriv-head, body.dark .metric-chip, body.dark .ctrl-btn, body.dark .array-cell, body.dark .chem-item, body.dark .bio-card-item, body.dark .var-pill { background: var(--paper); border: 1px solid var(--line); }
body.dark .code-line.active, body.dark .proof-table tr.active-proof td { background: var(--tint); color: var(--accent); }
body.dark .array-cell.in-boundary { background: var(--tint); border-color: var(--accent); }
body.dark .widget-badge.status-warn { background: #332000; color: #ffd982; border-color: #553500; }
body.dark .widget-badge.status-ok { background: #0b2611; color: #a5d6a7; border-color: #1b4d24; }
body.dark .widget-badge.status-term { background: #0c2040; color: #90caf9; border-color: #153a6e; }

/* Responsive Breakpoints */
@media (max-width: 1100px) {
  .workspace { grid-template-columns: 240px minmax(0, 1fr) 380px; gap: 12px; padding: 0 12px 12px 12px; }
  .workspace.left-off { grid-template-columns: 0 minmax(0, 1fr) 380px; }
  .workspace.right-off { grid-template-columns: 240px minmax(0, 1fr) 0; }
}
@media (max-width: 900px) {
  .workspace { grid-template-columns: 240px minmax(0, 1fr) 0; }
  .workspace.left-off { grid-template-columns: 0 minmax(0, 1fr) 0; }
  .right { visibility: hidden; }
  .workspace:not(.right-off) .right {
    position: fixed;
    right: 12px;
    top: 56px;
    bottom: 12px;
    width: min(440px, 94vw);
    visibility: visible;
    z-index: 20;
    box-shadow: 0 10px 40px rgba(0,0,0,0.25);
  }
}
@media (max-width: 600px) {
  .topbar { padding: 0 14px; }
  .topright .prototype, .topright .avatar { display: none; }
  .slash, .coursename { display: none; }
  .workspace, .workspace.right-off, .workspace.left-off, .workspace.left-off.right-off { grid-template-columns: 0 minmax(0, 1fr) 0; }
  .left { visibility: hidden; }
  .workspace:not(.left-off) .left {
    position: fixed;
    top: 56px;
    bottom: 12px;
    left: 12px;
    width: 280px;
    visibility: visible;
    z-index: 25;
    box-shadow: 0 10px 40px rgba(0,0,0,0.25);
  }
  .showleft { display: inline-flex; }
  .composerwrap { padding: 10px 14px; }
  .threadinner { padding: 20px 16px; }
}
</style>
</head>
<body>
<svg style="display:none" aria-hidden="true"><defs>
<symbol id="book" viewBox="0 0 24 24"><path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4V4Zm16 0h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h3V4Z"/></symbol>
<symbol id="search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></symbol>
<symbol id="plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
<symbol id="panel" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></symbol>
<symbol id="file" viewBox="0 0 24 24"><path d="M5 3h9l5 5v13H5Z M14 3v5h5M8 12h8M8 16h6"/></symbol>
<symbol id="chat" viewBox="0 0 24 24"><path d="M4 4h16v12H9l-5 4V4Z"/></symbol>
<symbol id="note" viewBox="0 0 24 24"><path d="M5 3h14v13l-5 5H5V3Zm9 18v-5h5M8 8h8M8 12h6"/></symbol>
<symbol id="chevron" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></symbol>
<symbol id="chevron-down" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>
<symbol id="close" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></symbol>
<symbol id="arrow" viewBox="0 0 24 24"><path d="M12 19V5m-6 6 6-6 6 6"/></symbol>
<symbol id="spark" viewBox="0 0 24 24"><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/></symbol>
<symbol id="copy" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></symbol>
<symbol id="moon" viewBox="0 0 24 24"><path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/></symbol>
<symbol id="back" viewBox="0 0 24 24"><path d="m14 6-6 6 6 6"/></symbol>
<symbol id="check" viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/></symbol>
<symbol id="refresh" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></symbol>
</defs></svg>
<header class="topbar">
  <div class="breadcrumbs">
    <button class="brand" id="home"><span class="brandmark"><svg><use href="#book"/></svg></span><span>NotebookSpace</span></button>
    <span class="slash">/</span>
    <button class="subject-dropdown inline" id="subjects" aria-label="Switch academic subject">
      <span class="coursename" id="coursename">EECS 3101 · Algorithms</span>
      <svg class="dropdown-chevron"><use href="#chevron-down"/></svg>
    </button>
  </div>
  <div class="topright">
    <button class="icon" id="theme" aria-label="Toggle dark mode" title="Toggle theme"><svg><use href="#moon"/></svg></button>
    <div class="avatar" aria-label="Demo student">A</div>
  </div>
</header>
<div class="shell workspace" id="shell">
  <!-- Left Panel: Sources Card -->
  <aside class="left" aria-label="Sources and conversations">
    <div class="panelhead">
      <div class="inline">
        <span style="font-size:15px;font-weight:600">Sources</span>
        <span class="dock-badge" id="sourcecount">5</span>
      </div>
      <button class="icon mini-icon" id="hideleft" aria-label="Collapse sources"><svg><use href="#panel"/></svg></button>
    </div>
    <div class="leftbody">
      <button class="add inline" id="addsource"><svg><use href="#plus"/></svg>Add source</button>
      <label class="search"><svg><use href="#search"/></svg><input id="sourcesearch" placeholder="Search sources" aria-label="Search sources"></label>
      <div class="selection">
        <span id="selectedcount">3 of 5 selected</span>
        <button id="selectall">Select all</button>
      </div>
      <div id="sourcelist"></div>
      <div class="sectionhead">
        <span>Conversations</span>
        <button class="icon mini-icon" id="newchat" aria-label="New conversation"><svg><use href="#plus"/></svg></button>
      </div>
      <div id="conversations"></div>
    </div>
  </aside>

  <!-- Center Panel: Chat Card -->
  <main class="center">
    <div class="chathead">
      <div class="inline" style="flex:1;min-width:0;overflow:hidden">
        <button class="icon showleft mini-icon" id="showleft" aria-label="Expand sources"><svg><use href="#panel"/></svg></button>
        <span class="chattitle" id="chattitle">Chat</span>
      </div>
    </div>
    <div class="thread" id="thread">
      <div class="threadinner" id="messages"></div>
    </div>
    <div class="composerwrap">
      <form class="composer" id="composer">
        <textarea id="prompt" rows="1" placeholder="Ask a question about your sources…" aria-label="Ask a question"></textarea>
        <div class="composerbottom">
          <button type="button" class="scope" id="scope"><svg><use href="#check"/></svg><span id="scopetext">3 sources</span></button>
          <button class="send" type="submit" aria-label="Send question"><svg><use href="#arrow"/></svg></button>
        </div>
      </form>
      <div class="disclaimer">NotebookSpace synthesizes answers across your verified course sources.</div>
    </div>
  </main>

  <!-- Right Panel: Studio Card (Single Full-Height Card) -->
  <aside class="right workbench-card" id="workbench-card" aria-label="Studio panel">
    <div class="workbench-head">
      <div class="benchtabs">
        <button class="benchtab selected inline" id="labtab" data-wtab="lab" data-bench-tab="lab">
          <svg><use href="#spark"/></svg><span>Interactive Lab</span>
        </button>
        <button class="benchtab inline" id="citationtab" data-wtab="passage" data-bench-tab="source">
          <svg><use href="#file"/></svg><span>Source Guide</span>
        </button>
        <button class="benchtab inline" id="notestab" data-wtab="notes" data-bench-tab="notes">
          <svg><use href="#note"/></svg><span>Notes</span>
          <span class="dock-badge" id="docknotecount">2</span>
        </button>
      </div>
      <button class="icon mini-icon" id="hideright" aria-label="Collapse studio panel" title="Collapse studio panel"><svg><use href="#close"/></svg></button>
    </div>
    <div class="workbench-body" id="workbench-body">
      <!-- Tab 1: Interactive Lab -->
      <div id="workbench-lab-view"></div>

      <!-- Tab 2: Source Guide -->
      <div id="workbench-passage-view" style="display:none"></div>

      <!-- Tab 3: Notes Studio View -->
      <div class="notes-dock-card" id="workbench-notes-view" style="display:none">
        <div class="notes-dock-head">
          <div class="notes-dock-title inline">
            <svg style="width:14px;height:14px"><use href="#note"/></svg>
            <span>Study Notes</span>
          </div>
          <button class="add-note-btn inline" id="dockaddnote"><svg style="width:13px;height:13px"><use href="#plus"/></svg>Add note</button>
        </div>
        <div class="quick-scratchpad">
          <input class="scratchpad-input" id="quicknoteinput" placeholder="+ Quick note or scratchpad… (Press Enter)" aria-label="Quick note input">
        </div>
        <div class="dock-notes-list" id="docknoteslist"></div>
      </div>
    </div>
  </aside>
</div>

<div class="modalback" id="modalback" hidden>
  <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modaltitle">
    <div class="modalhead"><h2 id="modaltitle"></h2><button class="icon mini-icon" id="closemodal" aria-label="Close dialog"><svg><use href="#close"/></svg></button></div>
    <div id="modalcontent"></div>
  </section>
</div>
<div class="toast" role="status" id="toast"></div>

<script>
const $ = s => document.querySelector(s),
      icon = n => `<svg aria-hidden="true"><use href="#${n}"/></svg>`,
      esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const ALL_SUBJECTS = {
  cs: {
    key: 'cs',
    code: 'EECS 3101',
    name: 'EECS 3101 · Algorithms',
    fullName: 'EECS 3101 · Design & Analysis of Algorithms',
    toolTitle: 'Line-by-Line Code Tracer',
    toolPill: 'Auto-mounted: Line-by-Line Code Tracer',
    keywords: ['loop', 'invariant', 'algorithm', 'binary search', 'big o', 'theta', 'sorting', 'array', 'pointer', 'recurrence', 'asymptotic', 'pseudocode', 'trace', 'sum_array', 'complexity', 'code', 'proof'],
    sources: [
      { id: 101, title: 'Lecture 03 · Loop invariants & Proof Checklist', meta: 'PDF · 24 pages', selected: true },
      { id: 102, title: 'Lecture 04 · Asymptotic analysis (O, Θ, Ω)', meta: 'PDF · 32 pages', selected: true },
      { id: 103, title: 'Tutorial 02 · Invariant Practice Problems', meta: 'PDF · 6 pages', selected: true },
      { id: 104, title: 'Lecture 05 · Recurrences & Master Method', meta: 'PDF · 28 pages', selected: false },
      { id: 105, title: 'Course outline · Fall 2026', meta: 'PDF · 8 pages', selected: false }
    ],
    chats: [
      { title: 'Understanding loop invariants', kind: 'cs', extra: [] },
      { title: 'Big O vs. Big Theta', kind: 'cs_complexity', extra: [] },
      { title: 'Working through binary search', kind: 'cs_binary', extra: [] }
    ],
    passages: {
      1: { source: 101, page: 8, title: 'Proving correctness with invariants', text: 'A loop invariant is a formal predicate that holds before and after each iteration of the loop.', highlight: 'To establish correctness, prove initialization, maintenance, and termination.', after: 'At termination, the invariant combined with the exit condition guarantees the postcondition holds.' },
      2: { source: 102, page: 12, title: 'Tight asymptotic bounds', text: 'We use asymptotic notation to classify algorithmic growth independently of hardware architectures.', highlight: 'Θ(g(n)) is a tight asymptotic bound: f(n) is bounded above and below by positive multiples of g(n).', after: 'An O bound specifies only the upper boundary. A tight bound gives exact growth classification.' },
      3: { source: 103, page: 2, title: 'Invariant for array sum', text: 'Consider a loop that accumulates array elements sequentially from index 0 to n-1.', highlight: 'Before iteration i, total equals the sum of subarray A[0 … i − 1].', after: 'Initially i = 0 and total = 0. Adding A[i] advances the boundary. When i = n, all n items are summed.' }
    },
    notes: [
      { title: 'The three parts of an invariant proof', text: 'Initialization: true before first iteration. Maintenance: an iteration preserves it for the next. Termination: loop exit condition + invariant proves required postcondition.', source: 'Lecture 03 · p. 8' },
      { title: 'Big O is an upper bound', text: 'O describes an asymptotic upper bound. Θ gives a tight bound, while Ω gives a lower bound.', source: 'Lecture 04 · p. 12' }
    ]
  },

  math: {
    key: 'math',
    code: 'MATH 2015',
    name: 'MATH 2015 · Calculus & Probability',
    fullName: 'MATH 2015 · Multivariable Calculus & Probability',
    toolTitle: 'Derivation Unfolder & Curve Lab',
    toolPill: 'Auto-mounted: Derivation Unfolder & Curve Lab',
    keywords: ['math', 'calculus', 'integral', 'derivative', 'tangent', 'slope', 'riemann', 'probability', 'normal distribution', 'bell curve', 'z-score', 'tail', 'integration by parts', 'chain rule', 'bayes', 'area', 'algebra', 'deviation'],
    sources: [
      { id: 201, title: 'Lecture 05 · Integration by Parts & Series', meta: 'PDF · 22 pages', selected: true },
      { id: 202, title: 'Lecture 08 · Riemann Integrals & FTC', meta: 'PDF · 28 pages', selected: true },
      { id: 203, title: 'Lecture 11 · Continuous Distributions & Z-Scores', meta: 'PDF · 30 pages', selected: true },
      { id: 204, title: 'Tutorial 04 · Standard Normal Tail Probabilities', meta: 'PDF · 10 pages', selected: false },
      { id: 205, title: 'Calculus & Probability Reference Manual', meta: 'PDF · 16 pages', selected: false }
    ],
    chats: [
      { title: 'Integration by Parts & Derivation', kind: 'math', extra: [] },
      { title: 'Tangent Slopes & Rate of Change', kind: 'math_tangent', extra: [] },
      { title: 'Riemann Sums vs Definite Integrals', kind: 'math_riemann', extra: [] }
    ],
    passages: {
      1: { source: 201, page: 7, title: 'Integration by Parts theorem', text: 'From the product rule d/dx[uv] = u\'v + uv\', integrating both sides yields the foundational transformation.', highlight: '∫ u dv = u v − ∫ v du allows converting an intractable integrand into an elementary one.', after: 'Select u according to the LIATE hierarchy (Logarithmic, Inverse trig, Algebraic, Trigonometric, Exponential).' },
      2: { source: 202, page: 14, title: 'Definite integrals via Riemann sums', text: 'The definite integral is defined as the limit of Riemann sums as partition fineness approaches zero.', highlight: '∫_a^b f(x) dx = lim_{n→∞} ∑_{i=1}^n f(x_i*) Δx where Δx = (b − a)/n.', after: 'For continuous functions, midpoint sums accelerate convergence with error bounded by O(1/n²).' },
      3: { source: 203, page: 19, title: 'The Standard Normal CDF', text: 'The standard Gaussian density has mean μ = 0 and standard deviation σ = 1 with symmetric bell geometry.', highlight: 'P(Z ≤ z) = (1 / √(2π)) ∫_{-∞}^z e^{-t²/2} dt represents the cumulative left tail probability.', after: 'Key benchmarks include P(Z ≤ 0) = 0.50, P(Z ≤ 1.96) = 0.975, with total area strictly equal to 1.0.' }
    },
    notes: [
      { title: 'Integration by Parts substitution strategy', text: 'Always differentiate u towards simplification (algebraic polynomials become constants) and integrate dv cleanly.', source: 'Lecture 05 · p. 7' },
      { title: 'Normal curve symmetry and tails', text: 'Because normal density is symmetric around μ = 0, P(Z > z) = 1 − P(Z ≤ z) = P(Z ≤ −z).', source: 'Lecture 11 · p. 19' }
    ]
  },

  physics: {
    key: 'physics',
    code: 'PHYS 1800',
    name: 'PHYS 1800 · Mechanics',
    fullName: 'PHYS 1800 · Classical Mechanics & Dynamics',
    toolTitle: 'Free-Body Vector & Slider Lab',
    toolPill: 'Auto-mounted: Free-Body Vector & Slider Lab',
    keywords: ['physics', 'mechanics', 'incline', 'inclined plane', 'ramp', 'free-body', 'vector', 'normal force', 'friction', 'mass', 'gravity', 'kinematics', 'dynamics', 'newton', 'coefficient', 'theta', 'acceleration', 'equations'],
    sources: [
      { id: 301, title: 'Chapter 05 · Newton\'s Laws & Force Vectors', meta: 'PDF · 36 pages', selected: true },
      { id: 302, title: 'Chapter 06 · Inclined Planes & Friction Dynamics', meta: 'PDF · 30 pages', selected: true },
      { id: 303, title: 'Lab 03 · Friction Coefficients on Tilted Surfaces', meta: 'PDF · 12 pages', selected: true },
      { id: 304, title: 'Problem Set 04 · Kinematics & Energy', meta: 'PDF · 8 pages', selected: false },
      { id: 305, title: 'Mechanics Formula Reference Guide', meta: 'PDF · 6 pages', selected: false }
    ],
    chats: [
      { title: 'Inclined Plane Free-Body Dynamics', kind: 'physics', extra: [] },
      { title: 'Static vs Kinetic Friction Threshold', kind: 'physics_friction', extra: [] },
      { title: 'Angle of Repose & Sliding Acceleration', kind: 'physics_repose', extra: [] }
    ],
    passages: {
      1: { source: 301, page: 11, title: 'Resolving forces along rotated axes', text: 'For motion on an inclined plane, rotate the coordinate axes so x lies parallel to the surface and y is perpendicular.', highlight: 'Gravity decomposes into F_gx = mg sin(θ) down the incline and F_gy = mg cos(θ) into the surface.', after: 'Because there is no motion perpendicular to the ramp (a_y = 0), Newton\'s second law gives F_N = mg cos(θ).' },
      2: { source: 302, page: 18, title: 'Friction and threshold of sliding', text: 'Static friction matches the applied parallel force up to maximum f_{s,max} = μ_s F_N.', highlight: 'When F_gx exceeds f_{s,max}, kinetic friction takes over: f_k = μ_k mg cos(θ).', after: 'Net downhill force is F_net = mg sin(θ) − μ_k mg cos(θ), giving acceleration a = g(sin(θ) − μ_k cos(θ)).' },
      3: { source: 303, page: 4, title: 'Independence of mass in slide angle', text: 'Mass m appears linearly in both the driving downhill component and the frictional resistance.', highlight: 'Sliding occurs when tan(θ) > μ_s; acceleration a = g(sin(θ) − μ_k cos(θ)) is completely independent of mass.', after: 'A 20 kg block and a 1 kg block will slip at identical ramp angles and accelerate at the exact same rate.' }
    },
    notes: [
      { title: 'Tilted coordinate frame rule', text: 'Align x-axis with the ramp slope so acceleration vector is purely one-dimensional: a_x = a, a_y = 0.', source: 'Chapter 05 · p. 11' },
      { title: 'Critical sliding angle formula', text: 'Critical angle θ_c where sliding begins is given by tan(θ_c) = μ_s.', source: 'Chapter 06 · p. 18' }
    ]
  },

  chem: {
    key: 'chem',
    code: 'CHEM 2020',
    name: 'CHEM 2020 · Organic Chemistry',
    fullName: 'CHEM 2020 · Introductory Organic Chemistry',
    toolTitle: '2D Molecule & Mechanism Viewer',
    toolPill: 'Auto-mounted: 2D Molecule & Mechanism Viewer',
    keywords: ['chemistry', 'chem', 'organic', 'sn2', 'sn1', 'nucleophile', 'electrophile', 'leaving group', 'bromobutane', 'stereochemistry', 'walden', 'inversion', 'hybridization', 'transition state', 'pentacoordinate', 'orbital', 'mechanism', 'molecule'],
    sources: [
      { id: 401, title: 'Chapter 07 · Nucleophilic Substitution (SN1 vs SN2)', meta: 'PDF · 38 pages', selected: true },
      { id: 402, title: 'Chapter 08 · Stereochemistry & Walden Inversion', meta: 'PDF · 26 pages', selected: true },
      { id: 403, title: 'Reaction Guide · Organohalides & Mechanisms', meta: 'PDF · 18 pages', selected: true },
      { id: 404, title: 'Frontier Molecular Orbitals in Substitution', meta: 'PDF · 14 pages', selected: false },
      { id: 405, title: 'Organic Chemistry Lab Manual · Alcohols', meta: 'PDF · 20 pages', selected: false }
    ],
    chats: [
      { title: 'SN2 Mechanism of 2-Bromobutane', kind: 'chem', extra: [] },
      { title: 'Pentacoordinate Transition State', kind: 'chem_ts', extra: [] },
      { title: 'Walden Inversion Stereochemistry', kind: 'chem_walden', extra: [] }
    ],
    passages: {
      1: { source: 401, page: 9, title: 'Bimolecular nucleophilic substitution (SN2)', text: 'The SN2 reaction occurs in a single concerted step without carbocation intermediates.', highlight: 'Rate = k[substrate][Nu⁻] exhibits second-order kinetics with bond formation and bond cleavage occurring simultaneously.', after: 'Steric hindrance strongly governs rate: methyl > primary > secondary >> tertiary (unreactive due to steric clash).' },
      2: { source: 402, page: 15, title: 'The pentacoordinate transition state', text: 'As the nucleophile approaches, the central electrophilic carbon rehybridizes from sp³ to sp²-like.', highlight: 'In the transition state [HO···C···Br]‡, three equatorial groups lie in a plane with axial partial bonds.', after: 'The unhybridized p-orbital on C_α simultaneously overlaps with the incoming oxygen lone pair and departing bromine.' },
      3: { source: 403, page: 6, title: 'Walden inversion of stereocenters', text: 'Backside attack into the σ* C-Br antibonding orbital forces the three equatorial ligands to flip like an umbrella in a gale.', highlight: 'A chiral substrate with (R) configuration inverts cleanly to the (S) enantiomer with 100% stereospecificity.', after: 'Bromide departs as a stable, solvated weak base Br⁻ carrying the bonding electron pair.' }
    },
    notes: [
      { title: 'Frontier orbital overlap in SN2', text: 'Nucleophile HOMO (lone pair of :OH⁻) donates electron density directly into the large back lobe of the C-Br σ* LUMO.', source: 'Chapter 07 · p. 9' },
      { title: 'Stereochemical umbrella flip', text: 'Walden inversion flips configuration (e.g. R to S) because attack is strictly 180° opposite the departing group.', source: 'Chapter 08 · p. 15' }
    ]
  },

  bio: {
    key: 'bio',
    code: 'BIOL 2020',
    name: 'BIOL 2020 · Cell Biology',
    fullName: 'BIOL 2020 · Cell Biology & Bioenergetics',
    toolTitle: 'Cellular Pathway Flow Map',
    toolPill: 'Auto-mounted: Cellular Pathway Flow Map',
    keywords: ['biology', 'bio', 'cell', 'cellular', 'glycolysis', 'pyruvate', 'mitochondria', 'citric acid', 'krebs', 'electron transport', 'atp', 'enzyme', 'pfk', 'phosphofructokinase', 'allosteric', 'inhibition', 'feedback', 'pathway', 'respiration', 'matrix', 'membrane'],
    sources: [
      { id: 501, title: 'Unit 04 · Cellular Respiration & Bioenergetics', meta: 'PDF · 40 pages', selected: true },
      { id: 502, title: 'Unit 05 · Glycolysis & Allosteric Regulation', meta: 'PDF · 32 pages', selected: true },
      { id: 503, title: 'Lab 02 · Mitochondrial Proton Motive Force & ATP', meta: 'PDF · 15 pages', selected: true },
      { id: 504, title: 'Unit 06 · Citric Acid Cycle & Electron Carriers', meta: 'PDF · 24 pages', selected: false },
      { id: 505, title: 'Cellular Metabolism Study Guide · Fall 2026', meta: 'PDF · 14 pages', selected: false }
    ],
    chats: [
      { title: 'Aerobic Respiration Pathway Map', kind: 'bio', extra: [] },
      { title: 'PFK-1 Allosteric Feedback Inhibition', kind: 'bio_pfk', extra: [] },
      { title: 'Proton Gradient & ATP Synthase Yield', kind: 'bio_atp', extra: [] }
    ],
    passages: {
      1: { source: 501, page: 12, title: 'Compartmentalized aerobic respiration', text: 'Glucose breakdown is partitioned across physical barriers: glycolysis in the cytosol, and downstream oxidation in mitochondria.', highlight: 'Glycolysis yields 2 pyruvate + 2 NADH + 2 ATP net; pyruvate enters the matrix for complete oxidation to CO₂.', after: 'Reduced cofactors (10 NADH and 2 FADH₂) feed electrons into complexes I-IV on the inner mitochondrial membrane.' },
      2: { source: 502, page: 18, title: 'Phosphofructokinase-1 (PFK-1) regulation', text: 'PFK-1 catalyzes the committed phosphorylation of Fructose-6-phosphate to Fructose-1,6-bisphosphate.', highlight: 'ATP is both a substrate at the catalytic site and an allosteric inhibitor at a distinct low-affinity regulatory site.', after: 'When cellular ATP/AMP ratio is high, ATP binds the regulatory site, lowering affinity for F6P and throttling glycolysis.' },
      3: { source: 503, page: 7, title: 'Chemiosmotic ATP synthesis', text: 'Complexes I, III, and IV pump protons into the intermembrane space, creating an electrochemical proton gradient (ΔΨ + ΔpH).', highlight: 'Protons flow back into the matrix through F₀F₁ ATP synthase, yielding approximately 26–28 ATP by oxidative phosphorylation.', after: 'Total theoretical aerobic ATP yield per glucose molecule stands at 30 to 32 ATP under optimal stoichiometry.' }
    },
    notes: [
      { title: 'PFK-1 allosteric feedback mechanism', text: 'High ATP signals cellular energy abundance. ATP binds the allosteric site to shift PFK-1 to the T (tense) inactive state.', source: 'Unit 05 · p. 18' },
      { title: 'Net ATP yield breakdown per glucose', text: 'Glycolysis: +2 ATP. Krebs cycle: +2 ATP/GTP. Oxidative phosphorylation: ~26-28 ATP. Net sum: ~30-32 ATP.', source: 'Unit 04 · p. 12' }
    ]
  }
};

/* -------------------------------------------------------------
   Active State & LocalStorage Persistence
------------------------------------------------------------- */
let currentSubjectKey = 'cs';
try {
  let storedSub = localStorage.getItem('ns-active-subject');
  if (storedSub && ALL_SUBJECTS[storedSub]) currentSubjectKey = storedSub;
} catch {}

let subjectsStore = {};
try {
  let savedData = JSON.parse(localStorage.getItem('ns-subjects-data-v2') || '{}');
  subjectsStore = savedData;
} catch {}

// Ensure each subject has valid data in store
Object.keys(ALL_SUBJECTS).forEach(k => {
  if (!subjectsStore[k]) {
    subjectsStore[k] = {
      sources: JSON.parse(JSON.stringify(ALL_SUBJECTS[k].sources)),
      chats: JSON.parse(JSON.stringify(ALL_SUBJECTS[k].chats)),
      notes: JSON.parse(JSON.stringify(ALL_SUBJECTS[k].notes))
    };
  }
});

let activeSubject = ALL_SUBJECTS[currentSubjectKey];
let sources = subjectsStore[currentSubjectKey].sources;
let chats = subjectsStore[currentSubjectKey].chats;
let notes = subjectsStore[currentSubjectKey].notes;
let passages = activeSubject.passages;
let mode = 'passage', citation = 1, current = 0;

function persist() {
  try {
    subjectsStore[currentSubjectKey] = { sources, chats, notes };
    localStorage.setItem('ns-active-subject', currentSubjectKey);
    localStorage.setItem('ns-subjects-data-v2', JSON.stringify(subjectsStore));
  } catch {}
}

/* -------------------------------------------------------------
   Automatic Subject & Feature Classifier
------------------------------------------------------------- */
function detectSubjectFeature(promptText = '', activeSources = []) {
  if (promptText && promptText.trim().length > 0) {
    let lower = promptText.toLowerCase();
    let bestKey = null, maxScore = 0;
    for (const [key, sub] of Object.entries(ALL_SUBJECTS)) {
      let score = 0;
      for (const kw of sub.keywords) {
        if (lower.includes(kw)) score += (kw.length > 5 ? 2 : 1);
      }
      if (score > maxScore) {
        maxScore = score;
        bestKey = key;
      }
    }
    if (bestKey && maxScore >= 1) return bestKey;
  }

  let list = activeSources.length ? activeSources : sources.filter(s => s.selected);
  if (list.length > 0) {
    let titles = list.map(s => s.title.toLowerCase()).join(' ');
    let bestKey = null, maxScore = 0;
    for (const [key, sub] of Object.entries(ALL_SUBJECTS)) {
      let score = 0;
      for (const kw of sub.keywords) {
        if (titles.includes(kw)) score += (kw.length > 5 ? 2 : 1);
      }
      if (score > maxScore) {
        maxScore = score;
        bestKey = key;
      }
    }
    if (bestKey && maxScore >= 1) return bestKey;
  }

  return currentSubjectKey || 'cs';
}

function updateAutoMountPill(featureKey) {
  let sub = ALL_SUBJECTS[featureKey] || ALL_SUBJECTS[currentSubjectKey];
  let pillText = sub.toolPill;
  let pillEl = $('#chatheadpill');
  if (pillEl) pillEl.textContent = pillText;
}

const cite = (id, label) => `<button class="cite ${citation===id?'active':''}" data-cite="${id}" aria-label="Open citation ${label}">${label}</button>`;

/* -------------------------------------------------------------
   Interactive Domain Tool Renderers & Controllers
------------------------------------------------------------- */

// Widget Unique State Store
const widgetStates = {};

// ================= CS: Line-by-Line Code & Loop Invariant Tracer =================
function renderCSWidgetHTML(wId) {
  return `
  <div class="domain-widget" id="${wId}" data-type="cs">
    <div class="widget-head">
      <div class="widget-title">
        <svg style="width:16px;height:16px;color:var(--accent)"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></svg>
        Line-by-Line Code & Memory Tracer
      </div>
      <div class="widget-ctrls">
        <span class="widget-badge" id="${wId}-status">Holds at loop header</span>
        <button class="ctrl-btn" data-cs-action="prev" data-wid="${wId}" title="Previous execution line">◀ Prev Line</button>
        <button class="ctrl-btn" data-cs-action="next" data-wid="${wId}" title="Next execution line">Next Line ▶</button>
        <button class="ctrl-btn" data-cs-action="reset" data-wid="${wId}" title="Reset tracer"><svg style="width:12px;height:12px"><use href="#refresh"/></svg> Reset</button>
      </div>
    </div>

    <!-- Pseudocode Line Execution Box -->
    <div class="tracer-code">
      <div class="code-line" data-cs-line="1" data-wid="${wId}"><span class="lineno">1</span><span class="linearrow"></span><span><code>def sum_array(A):</code></span></div>
      <div class="code-line" data-cs-line="2" data-wid="${wId}"><span class="lineno">2</span><span class="linearrow"></span><span><code>    total = 0</code></span></div>
      <div class="code-line" data-cs-line="3" data-wid="${wId}"><span class="lineno">3</span><span class="linearrow"></span><span><code>    for i in range(len(A)):        <span class="muted"># Loop invariant holds here</span></code></span></div>
      <div class="code-line" data-cs-line="4" data-wid="${wId}"><span class="lineno">4</span><span class="linearrow"></span><span><code>        total = total + A[i]       <span class="muted"># Temporarily broken mid-body</span></code></span></div>
      <div class="code-line" data-cs-line="5" data-wid="${wId}"><span class="lineno">5</span><span class="linearrow"></span><span><code>    return total                   <span class="muted"># Terminated: total == sum(A)</span></code></span></div>
    </div>

    <!-- Live Visual Array Strip -->
    <div class="array-container">
      <div class="small muted" style="margin-bottom:4px;font-weight:600">Visual Memory Strip · Array A:</div>
      <div class="array-strip" id="${wId}-array-strip"></div>
      <div class="boundary-legend">
        <span><span class="boundary-dot"></span> Invariant boundary <code>A[0 … i−1]</code></span>
        <span><strong style="color:var(--ink)">Active target:</strong> <code id="${wId}-active-desc">A[0] = 4</code></span>
      </div>
    </div>

    <!-- Variables -->
    <div class="var-pills">
      <div class="var-pill"><span>Index:</span> <strong id="${wId}-var-i">i = 0</strong></div>
      <div class="var-pill"><span>Current Value:</span> <strong id="${wId}-var-ai">A[i] = 4</strong></div>
      <div class="var-pill"><span>Accumulator:</span> <strong id="${wId}-var-total">total = 0</strong></div>
      <div class="var-pill"><span>Length:</span> <strong>n = 4</strong></div>
      <div class="var-pill" style="margin-left:auto"><span class="muted">Execution step:</span> <strong id="${wId}-step-counter">1 / 10</strong></div>
    </div>

    <!-- Invariant Proof Checklist Table -->
    <table class="proof-table">
      <thead>
        <tr><th style="width:22%">Proof Phase</th><th style="width:28%">Formal Invariant Condition</th><th>Execution Verification Status</th></tr>
      </thead>
      <tbody>
        <tr id="${wId}-proof-init" class="active-proof"><td style="font-weight:600">1. Initialize</td><td><code>total = ∑ A[0 … -1] = 0</code></td><td id="${wId}-proof-init-desc">Holds before loop entry. Empty prefix sum is mathematically 0.</td></tr>
        <tr id="${wId}-proof-maint"><td style="font-weight:600">2. Maintain</td><td><code>total + A[i] = ∑ A[0 … i]</code></td><td id="${wId}-proof-maint-desc">Adding element A[i] restores invariant truth for iteration i+1.</td></tr>
        <tr id="${wId}-proof-term"><td style="font-weight:600">3. Terminate</td><td><code>i = n ⟹ total = ∑ A[0 … n-1]</code></td><td id="${wId}-proof-term-desc">Exit occurs when i = 4. Total contains full array sum.</td></tr>
      </tbody>
    </table>
  </div>
  `;
}

const CS_STEPS = [
  { line: 2, i: 0, total: 0, status: 'Holds at loop header', statusClass: 'status-ok', proof: 'init', desc: 'Initialize: before loop, i = 0, total = 0. Invariant boundary is empty prefix.' },
  { line: 3, i: 0, total: 0, status: 'Holds at loop header', statusClass: 'status-ok', proof: 'init', desc: 'Loop header: i = 0. Invariant holds: total equals sum(A[0..-1]) = 0.' },
  { line: 4, i: 0, total: 4, status: 'Temporarily broken mid-body', statusClass: 'status-warn', proof: 'maint', desc: 'Mid-body: adding A[0]=4. Accumulator is 4 while index is still 0.' },
  { line: 3, i: 1, total: 4, status: 'Restored for i+1', statusClass: 'status-ok', proof: 'maint', desc: 'Loop header: index advances to 1. Invariant restored: total = 4 = sum(A[0..0]).' },
  { line: 4, i: 1, total: 11, status: 'Temporarily broken mid-body', statusClass: 'status-warn', proof: 'maint', desc: 'Mid-body: adding A[1]=7. Accumulator is 11 while index is 1.' },
  { line: 3, i: 2, total: 11, status: 'Restored for i+1', statusClass: 'status-ok', proof: 'maint', desc: 'Loop header: index advances to 2. Invariant restored: total = 11 = sum(A[0..1]).' },
  { line: 4, i: 2, total: 13, status: 'Temporarily broken mid-body', statusClass: 'status-warn', proof: 'maint', desc: 'Mid-body: adding A[2]=2. Accumulator is 13 while index is 2.' },
  { line: 3, i: 3, total: 13, status: 'Restored for i+1', statusClass: 'status-ok', proof: 'maint', desc: 'Loop header: index advances to 3. Invariant restored: total = 13 = sum(A[0..2]).' },
  { line: 4, i: 3, total: 22, status: 'Temporarily broken mid-body', statusClass: 'status-warn', proof: 'maint', desc: 'Mid-body: adding A[3]=9. Accumulator is 22 while index is 3.' },
  { line: 5, i: 4, total: 22, status: 'Terminated', statusClass: 'status-term', proof: 'term', desc: 'Termination: i = 4 = len(A). Loop condition fails. Return total = 22.' }
];
const CS_ARRAY = [4, 7, 2, 9];

function updateCSWidget(wId) {
  let st = widgetStates[wId] || { step: 0 };
  let cur = CS_STEPS[st.step] || CS_STEPS[0];

  // Update line highlights
  const el = document.getElementById(wId);
  if (!el) return;

  el.querySelectorAll('.code-line').forEach(line => {
    let lNo = +line.dataset.csLine;
    let isActive = (lNo === cur.line);
    line.classList.toggle('active', isActive);
    let arrow = line.querySelector('.linearrow');
    if (arrow) arrow.textContent = isActive ? '▶' : '';
  });

  // Update Status badge
  const statusBadge = document.getElementById(`${wId}-status`);
  if (statusBadge) {
    statusBadge.textContent = cur.status;
    statusBadge.className = `widget-badge ${cur.statusClass}`;
  }

  // Update Array Strip
  const strip = document.getElementById(`${wId}-array-strip`);
  if (strip) {
    strip.innerHTML = CS_ARRAY.map((val, idx) => {
      let inBoundary = (idx < cur.i);
      let isActive = (idx === cur.i && cur.i < CS_ARRAY.length && cur.line === 4);
      let isHeaderActive = (idx === cur.i && cur.i < CS_ARRAY.length && cur.line === 3);
      let cls = 'array-cell';
      if (inBoundary) cls += ' in-boundary';
      if (isActive || isHeaderActive) cls += ' active-idx';
      return `<div class="${cls}"><span class="val">${val}</span><span class="idx">A[${idx}]</span></div>`;
    }).join('');
  }

  // Update variables
  const varI = document.getElementById(`${wId}-var-i`);
  if (varI) varI.textContent = cur.i <= 3 ? `i = ${cur.i}` : `i = 4 (exit)`;
  const varAi = document.getElementById(`${wId}-var-ai`);
  if (varAi) varAi.textContent = cur.i <= 3 ? `A[${cur.i}] = ${CS_ARRAY[cur.i]}` : `A[i] = None`;
  const varTotal = document.getElementById(`${wId}-var-total`);
  if (varTotal) varTotal.textContent = `total = ${cur.total}`;
  const stepCtr = document.getElementById(`${wId}-step-counter`);
  if (stepCtr) stepCtr.textContent = `${st.step + 1} / ${CS_STEPS.length}`;
  const activeDesc = document.getElementById(`${wId}-active-desc`);
  if (activeDesc) activeDesc.textContent = cur.desc;

  // Proof table row highlighting
  ['init', 'maint', 'term'].forEach(p => {
    const row = document.getElementById(`${wId}-proof-${p}`);
    if (row) row.classList.toggle('active-proof', cur.proof === p);
  });
}

// ================= Math: Derivation Explorer & Unified Curve Canvas =================
function renderMathWidgetHTML(wId) {
  return `
  <div class="domain-widget" id="${wId}" data-type="math">
    <div class="widget-head">
      <div class="widget-title">
        <svg style="width:16px;height:16px;color:var(--accent)"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M8 12h8"/></svg>
        "Unfold Hidden Steps" Derivation & Unified Curve Canvas
      </div>
      <div class="widget-ctrls">
        <span class="widget-badge status-ok">Calc I · Calc II · Probability</span>
      </div>
    </div>

    <!-- Component 1: Multi-Step Derivation Explorer -->
    <div class="math-unfolder">
      <div class="small muted" style="margin-bottom:8px;font-weight:600">Derivation Explorer · Integration by Parts & Series:</div>
      
      <!-- Step 1 -->
      <div class="deriv-step">
        <div class="deriv-head">
          <div class="deriv-expr"><strong>Step 1:</strong> ∫ x · e^{2x} dx</div>
          <button class="unfold-btn" data-unfold="1" data-wid="${wId}">[+ Unfold intermediate algebra & rule]</button>
        </div>
        <div class="deriv-drawer" id="${wId}-drawer-1" style="display:none">
          <strong>Integration by Parts Rule:</strong> ∫ u dv = u v − ∫ v du.<br>
          • Choose <code>u = x</code> (Algebraic polynomial) ⟹ <code>du = 1 dx = dx</code>.<br>
          • Choose <code>dv = e^{2x} dx</code> (Exponential) ⟹ <code>v = ∫ e^{2x} dx = ½ e^{2x}</code>.<br>
          • Direct substitution yields: <code>(x)(½ e^{2x}) − ∫ (½ e^{2x}) dx</code>.
        </div>
      </div>

      <!-- Step 2 -->
      <div class="deriv-step">
        <div class="deriv-head">
          <div class="deriv-expr"><strong>Step 2:</strong> = ½ x · e^{2x} − ½ ∫ e^{2x} dx</div>
          <button class="unfold-btn" data-unfold="2" data-wid="${wId}">[+ Unfold intermediate algebra & rule]</button>
        </div>
        <div class="deriv-drawer" id="${wId}-drawer-2" style="display:none">
          <strong>Elementary Integration Rule:</strong> Pull scalar constant ½ out of integral.<br>
          • Anti-derivative formula: <code>∫ e^{kx} dx = (1/k) e^{kx} + C</code>.<br>
          • Here <code>k = 2</code>, so <code>∫ e^{2x} dx = ½ e^{2x}</code>.<br>
          • Multiplying scalars: <code>(−½) · (½ e^{2x}) = −¼ e^{2x}</code>.
        </div>
      </div>

      <!-- Step 3 -->
      <div class="deriv-step">
        <div class="deriv-head">
          <div class="deriv-expr"><strong>Step 3:</strong> = ½ x · e^{2x} − ¼ e^{2x} + C</div>
          <button class="unfold-btn" data-unfold="3" data-wid="${wId}">[+ Unfold intermediate algebra & rule]</button>
        </div>
        <div class="deriv-drawer" id="${wId}-drawer-3" style="display:none">
          <strong>Algebraic Factorization & Derivative Verification:</strong><br>
          • Extract common factor <code>¼ e^{2x}</code>: <code>½ x = (2/4) x</code>, leaving <code>¼ e^{2x}(2x − 1) + C</code>.<br>
          • Verification by Product Rule: <code>d/dx [ ¼ e^{2x}(2x − 1) ] = ½ e^{2x}(2x − 1) + ¼ e^{2x}(2) = x · e^{2x}</code>. Matches original integrand!
        </div>
      </div>

      <!-- Step 4 -->
      <div class="deriv-step" style="border-left:3px solid var(--accent)">
        <div class="deriv-head" style="background:var(--tint)">
          <div class="deriv-expr"><strong>Final Factored Form:</strong> <code>(e^{2x} / 4) · (2x − 1) + C</code></div>
          <span class="widget-badge status-ok">Exact & Proven</span>
        </div>
      </div>
    </div>

    <!-- Component 2: Unified SVG Curve & Shaded-Area Canvas -->
    <div class="small muted" style="margin:14px 0 8px;font-weight:600">Unified Dynamic Curve Canvas:</div>
    <div class="math-tabs">
      <button class="math-tab active" data-math-mode="calc1" data-wid="${wId}">Calculus I (Tangent Slope)</button>
      <button class="math-tab" data-math-mode="calc2" data-wid="${wId}">Calculus II (Riemann Integral Area)</button>
      <button class="math-tab" data-math-mode="prob" data-wid="${wId}">Probability (Normal Distribution Tail)</button>
    </div>

    <div class="svg-canvas-box" id="${wId}-svg-box">
      <svg id="${wId}-svg" viewBox="0 0 520 220" preserveAspectRatio="none"></svg>
    </div>

    <!-- Dynamic Sliders by Mode -->
    <div class="slider-strip" id="${wId}-sliders-box"></div>

    <!-- Live Mathematical Metrics -->
    <div class="metric-chips" id="${wId}-metrics-box"></div>
  </div>
  `;
}

// Normal Distribution CDF approximation (Abramowitz & Stegun)
function normalCDF(z) {
  let b1 = 0.319381530, b2 = -0.356563782, b3 = 1.781477937, b4 = -1.821255978, b5 = 1.330274429;
  let p = 0.2316419, c = 0.39894228;
  if (z >= 0) {
    let t = 1.0 / (1.0 + p * z);
    return (1.0 - c * Math.exp(-z * z / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1));
  } else {
    let t = 1.0 / (1.0 - p * z);
    return (c * Math.exp(-z * z / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1));
  }
}

function updateMathWidget(wId) {
  let st = widgetStates[wId] || {};
  if (st.x0 === undefined) st.x0 = 1.5;
  if (st.b === undefined) st.b = 3.2;
  if (st.n === undefined) st.n = 8;
  if (st.z === undefined) st.z = 1.25;
  if (!st.mode) st.mode = 'calc1';
  widgetStates[wId] = st;
  const svg = document.getElementById(`${wId}-svg`);
  const sliderBox = document.getElementById(`${wId}-sliders-box`);
  const metricsBox = document.getElementById(`${wId}-metrics-box`);
  if (!svg || !sliderBox || !metricsBox) return;

  // Render SVG and sliders based on mode
  if (st.mode === 'calc1') {
    // Calculus I: f(x) = -0.12x^3 + 0.6x^2 - 0.2x + 1.2 on [-0.5, 4.0]
    let f = x => -0.12 * Math.pow(x, 3) + 0.6 * Math.pow(x, 2) - 0.2 * x + 1.2;
    let df = x => -0.36 * Math.pow(x, 2) + 1.2 * x - 0.2;
    let xMin = -0.5, xMax = 4.0, yMin = 0, yMax = 4.0;
    let toSvgX = x => 45 + ((x - xMin) / (xMax - xMin)) * 430;
    let toSvgY = y => 190 - ((y - yMin) / (yMax - yMin)) * 160;

    let pts = [];
    for (let x = xMin; x <= xMax; x += 0.05) pts.push(`${toSvgX(x).toFixed(1)},${toSvgY(f(x)).toFixed(1)}`);
    let curvePath = `M ${pts.join(' L ')}`;

    let x0 = st.x0;
    let y0 = f(x0);
    let slope = df(x0);
    let tx1 = Math.max(xMin, x0 - 1.2), tx2 = Math.min(xMax, x0 + 1.2);
    let ty1 = y0 + slope * (tx1 - x0), ty2 = y0 + slope * (tx2 - x0);

    svg.innerHTML = `
      <line x1="45" y1="190" x2="485" y2="190" stroke="var(--line)" stroke-width="1.5"/>
      <line x1="45" y1="30" x2="45" y2="190" stroke="var(--line)" stroke-width="1.5"/>
      <path d="${curvePath}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
      <line x1="${toSvgX(tx1)}" y1="${toSvgY(ty1)}" x2="${toSvgX(tx2)}" y2="${toSvgY(ty2)}" stroke="#c84b31" stroke-width="2" stroke-dasharray="4,2"/>
      <circle cx="${toSvgX(x0)}" cy="${toSvgY(y0)}" r="5.5" fill="#c84b31" stroke="var(--bg)" stroke-width="2"/>
      <text x="${toSvgX(x0) + 8}" y="${toSvgY(y0) - 8}" font-size="11" font-weight="600" fill="var(--ink)">P(${x0.toFixed(2)}, ${y0.toFixed(2)})</text>
      <text x="440" y="205" font-size="10" fill="var(--muted)">x-axis</text>
      <text x="50" y="25" font-size="10" fill="var(--muted)">f(x)</text>
    `;

    sliderBox.innerHTML = `
      <div class="slider-group">
        <label>Tangent Point <span>x₀ = ${x0.toFixed(2)}</span></label>
        <input type="range" min="-0.2" max="3.8" step="0.05" value="${x0}" data-math-slider="x0" data-wid="${wId}">
      </div>
    `;

    metricsBox.innerHTML = `
      <div class="metric-chip"><small>Evaluation Point</small><strong>x₀ = ${x0.toFixed(2)}</strong></div>
      <div class="metric-chip"><small>Curve Value f(x₀)</small><strong>${y0.toFixed(3)}</strong></div>
      <div class="metric-chip"><small>Instantaneous Slope f'(x₀)</small><strong style="color:#c84b31">${slope.toFixed(3)}</strong></div>
      <div class="metric-chip"><small>Tangent Line Equation</small><strong>y = ${slope.toFixed(2)}x + ${(y0 - slope * x0).toFixed(2)}</strong></div>
    `;

  } else if (st.mode === 'calc2') {
    // Calculus II: f(x) = 0.22 x^2 + 0.6 on [0.5, b] with n rectangles
    let f = x => 0.22 * x * x + 0.6;
    let a = 0.5, b = st.b, n = st.n;
    let xMin = 0, xMax = 4.5, yMin = 0, yMax = 4.5;
    let toSvgX = x => 45 + ((x - xMin) / (xMax - xMin)) * 430;
    let toSvgY = y => 190 - ((y - yMin) / (yMax - yMin)) * 160;

    let pts = [];
    for (let x = xMin; x <= xMax; x += 0.05) pts.push(`${toSvgX(x).toFixed(1)},${toSvgY(f(x)).toFixed(1)}`);
    let curvePath = `M ${pts.join(' L ')}`;

    // Riemann rectangles
    let dx = (b - a) / n;
    let rectsSVG = '';
    let riemannSum = 0;
    for (let i = 0; i < n; i++) {
      let xMid = a + (i + 0.5) * dx;
      let h = f(xMid);
      riemannSum += h * dx;
      let rx = toSvgX(a + i * dx);
      let rw = toSvgX(a + (i + 1) * dx) - rx;
      let ry = toSvgY(h);
      let rh = 190 - ry;
      rectsSVG += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="var(--tint)" stroke="var(--accent)" stroke-width="1" opacity="0.8"/>`;
    }

    // Exact integral: ∫ (0.22 x^2 + 0.6) dx = [(0.22/3) x^3 + 0.6 x]
    let F = x => (0.22 / 3) * Math.pow(x, 3) + 0.6 * x;
    let exactIntegral = F(b) - F(a);
    let error = Math.abs(riemannSum - exactIntegral);

    svg.innerHTML = `
      <line x1="45" y1="190" x2="485" y2="190" stroke="var(--line)" stroke-width="1.5"/>
      <line x1="45" y1="30" x2="45" y2="190" stroke="var(--line)" stroke-width="1.5"/>
      ${rectsSVG}
      <path d="${curvePath}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
      <line x1="${toSvgX(a)}" y1="185" x2="${toSvgX(a)}" y2="195" stroke="var(--ink)" stroke-width="2"/>
      <line x1="${toSvgX(b)}" y1="185" x2="${toSvgX(b)}" y2="195" stroke="var(--ink)" stroke-width="2"/>
      <text x="${toSvgX(a) - 6}" y="206" font-size="10" fill="var(--ink)">a=0.5</text>
      <text x="${toSvgX(b) - 6}" y="206" font-size="10" fill="var(--ink)">b=${b.toFixed(1)}</text>
    `;

    sliderBox.innerHTML = `
      <div class="slider-group">
        <label>Upper Integration Limit <span>b = ${b.toFixed(1)}</span></label>
        <input type="range" min="1.2" max="4.2" step="0.1" value="${b}" data-math-slider="b" data-wid="${wId}">
      </div>
      <div class="slider-group">
        <label>Subdivision Rectangles <span>n = ${n}</span></label>
        <input type="range" min="4" max="24" step="1" value="${n}" data-math-slider="n" data-wid="${wId}">
      </div>
    `;

    metricsBox.innerHTML = `
      <div class="metric-chip"><small>Step Size Δx</small><strong>${dx.toFixed(3)}</strong></div>
      <div class="metric-chip"><small>Riemann Sum (Midpoint)</small><strong>${riemannSum.toFixed(3)}</strong></div>
      <div class="metric-chip"><small>Exact Definite Integral</small><strong style="color:var(--accent)">${exactIntegral.toFixed(3)}</strong></div>
      <div class="metric-chip"><small>Approximation Error |Rₙ − I|</small><strong>${error.toFixed(4)}</strong></div>
    `;

  } else if (st.mode === 'prob') {
    // Probability: Standard Normal Bell Curve N(0, 1)
    let phi = z => (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
    let zCut = st.z;
    let zMin = -3.5, zMax = 3.5, yMax = 0.45;
    let toSvgX = z => 45 + ((z - zMin) / (zMax - zMin)) * 430;
    let toSvgY = y => 190 - (y / yMax) * 160;

    let pts = [];
    for (let z = zMin; z <= zMax; z += 0.05) pts.push(`${toSvgX(z).toFixed(1)},${toSvgY(phi(z)).toFixed(1)}`);
    let curvePath = `M ${pts.join(' L ')}`;

    // Shaded tail path from -3.5 to zCut
    let tailPts = [`${toSvgX(zMin)},190`];
    for (let z = zMin; z <= zCut; z += 0.05) tailPts.push(`${toSvgX(z).toFixed(1)},${toSvgY(phi(z)).toFixed(1)}`);
    tailPts.push(`${toSvgX(zCut).toFixed(1)},${toSvgY(phi(zCut)).toFixed(1)}`);
    tailPts.push(`${toSvgX(zCut).toFixed(1)},190`);
    let tailPath = `M ${tailPts.join(' L ')} Z`;

    let pVal = normalCDF(zCut);
    let pct = (pVal * 100).toFixed(2);
    let upperPct = ((1 - pVal) * 100).toFixed(2);

    svg.innerHTML = `
      <line x1="45" y1="190" x2="485" y2="190" stroke="var(--line)" stroke-width="1.5"/>
      <path d="${tailPath}" fill="var(--mark)" opacity="0.85"/>
      <path d="${curvePath}" fill="none" stroke="var(--ink)" stroke-width="2"/>
      <line x1="${toSvgX(zCut)}" y1="30" x2="${toSvgX(zCut)}" y2="190" stroke="#c84b31" stroke-width="2" stroke-dasharray="3,3"/>
      <circle cx="${toSvgX(zCut)}" cy="${toSvgY(phi(zCut))}" r="4.5" fill="#c84b31"/>
      <text x="${toSvgX(zCut) - 15}" y="25" font-size="11" font-weight="600" fill="#c84b31">Z = ${zCut.toFixed(2)}</text>
      <text x="${toSvgX(0) - 5}" y="205" font-size="10" fill="var(--muted)">μ = 0</text>
      <text x="${toSvgX(1) - 5}" y="205" font-size="10" fill="var(--muted)">+1σ</text>
      <text x="${toSvgX(-1) - 8}" y="205" font-size="10" fill="var(--muted)">−1σ</text>
    `;

    sliderBox.innerHTML = `
      <div class="slider-group">
        <label>Standardized Cutoff Score <span>z = ${zCut.toFixed(2)}</span></label>
        <input type="range" min="-3.0" max="3.0" step="0.05" value="${zCut}" data-math-slider="z" data-wid="${wId}">
      </div>
    `;

    metricsBox.innerHTML = `
      <div class="metric-chip"><small>Mean & Variance</small><strong>μ = 0.0, σ = 1.0</strong></div>
      <div class="metric-chip"><small>Cutoff Z-Score</small><strong>z = ${zCut.toFixed(2)}</strong></div>
      <div class="metric-chip"><small>Cumulative P(Z ≤ z)</small><strong style="color:var(--accent)">${pct}%</strong></div>
      <div class="metric-chip"><small>Right Tail P(Z > z)</small><strong>${upperPct}%</strong></div>
    `;
  }
}

// ================= Physics: Free-Body Vector & Parameter Slider Lab =================
function renderPhysicsWidgetHTML(wId) {
  return `
  <div class="domain-widget" id="${wId}" data-type="physics">
    <div class="widget-head">
      <div class="widget-title">
        <svg style="width:16px;height:16px;color:var(--accent)"><polygon points="3 20 21 20 21 8 3 20"/></svg>
        Interactive Free-Body Vector & Formula Slider Lab
      </div>
      <div class="widget-ctrls">
        <span class="widget-badge" id="${wId}-motion-badge">Static Equilibrium</span>
        <button class="ctrl-btn" data-phys-action="test-drop" data-wid="${wId}"><svg style="width:12px;height:12px"><use href="#play"/></svg> Test Slide Ramp</button>
      </div>
    </div>

    <!-- Layout: Diagram Left, Dynamic Equations Right -->
    <div class="physics-layout">
      <div class="physics-svg-box">
        <svg id="${wId}-phys-svg" viewBox="0 0 340 240"></svg>
      </div>

      <div class="eq-box">
        <div class="small muted" style="font-weight:600">Governing Kinematics & Force Balances:</div>
        <div class="eq-row"><code>F_gx = mg sin(θ)</code><strong id="${wId}-eq-fgx">20.7 N</strong></div>
        <div class="eq-row"><code>F_N  = mg cos(θ)</code><strong id="${wId}-eq-fn">44.4 N</strong></div>
        <div class="eq-row"><code>f_k  = μ_k F_N</code><strong id="${wId}-eq-fk">11.1 N</strong></div>
        <div class="eq-row"><code>F_net = F_gx − f_k</code><strong id="${wId}-eq-fnet">9.6 N</strong></div>
        <div class="eq-row"><code>a = g(sin θ − μ_k cos θ)</code><strong id="${wId}-eq-accel" style="color:#c84b31">1.92 m/s²</strong></div>
      </div>
    </div>

    <!-- Parameter Sliders -->
    <div class="slider-strip" style="margin-top:14px">
      <div class="slider-group">
        <label>Incline Angle <span>θ = <span id="${wId}-lbl-theta">25°</span></span></label>
        <input type="range" min="5" max="60" step="1" value="25" data-phys-slider="theta" data-wid="${wId}">
      </div>
      <div class="slider-group">
        <label>Block Mass <span>m = <span id="${wId}-lbl-m">5.0 kg</span></span></label>
        <input type="range" min="1" max="20" step="0.5" value="5" data-phys-slider="m" data-wid="${wId}">
      </div>
      <div class="slider-group">
        <label>Friction Coeff <span>μ_k = <span id="${wId}-lbl-mu">0.25</span></span></label>
        <input type="range" min="0.0" max="0.8" step="0.02" value="0.25" data-phys-slider="mu" data-wid="${wId}">
      </div>
    </div>
  </div>
  `;
}

function updatePhysicsWidget(wId) {
  let st = widgetStates[wId] || { theta: 25, m: 5.0, mu: 0.25, animOffset: 0 };
  widgetStates[wId] = st;
  const svg = document.getElementById(`${wId}-phys-svg`);
  if (!svg) return;

  let g = 9.8;
  let rad = (st.theta * Math.PI) / 180;
  let sinT = Math.sin(rad), cosT = Math.cos(rad);
  let Fgx = st.m * g * sinT;
  let Fn = st.m * g * cosT;
  let Fk = st.mu * Fn;
  let muStatic = st.mu + 0.12;
  let FsMax = muStatic * Fn;

  let isSliding = Fgx > FsMax;
  let Fnet = isSliding ? (Fgx - Fk) : 0;
  let accel = isSliding ? (g * (sinT - st.mu * cosT)) : 0;

  // Update labels
  const lblTheta = document.getElementById(`${wId}-lbl-theta`);
  if (lblTheta) lblTheta.textContent = `${st.theta}°`;
  const lblM = document.getElementById(`${wId}-lbl-m`);
  if (lblM) lblM.textContent = `${st.m.toFixed(1)} kg`;
  const lblMu = document.getElementById(`${wId}-lbl-mu`);
  if (lblMu) lblMu.textContent = st.mu.toFixed(2);

  // Update equations
  const eqFgx = document.getElementById(`${wId}-eq-fgx`);
  if (eqFgx) eqFgx.textContent = `${Fgx.toFixed(1)} N`;
  const eqFn = document.getElementById(`${wId}-eq-fn`);
  if (eqFn) eqFn.textContent = `${Fn.toFixed(1)} N`;
  const eqFk = document.getElementById(`${wId}-eq-fk`);
  if (eqFk) eqFk.textContent = isSliding ? `${Fk.toFixed(1)} N` : `${Fgx.toFixed(1)} N (static)`;
  const eqFnet = document.getElementById(`${wId}-eq-fnet`);
  if (eqFnet) eqFnet.textContent = `${Fnet.toFixed(1)} N`;
  const eqAccel = document.getElementById(`${wId}-eq-accel`);
  if (eqAccel) eqAccel.textContent = `${accel.toFixed(2)} m/s²`;

  const motionBadge = document.getElementById(`${wId}-motion-badge`);
  if (motionBadge) {
    if (isSliding) {
      motionBadge.textContent = `Accelerating: a = ${accel.toFixed(2)} m/s²`;
      motionBadge.className = 'widget-badge status-warn';
    } else {
      motionBadge.textContent = 'Static Equilibrium (tan θ ≤ μs)';
      motionBadge.className = 'widget-badge status-ok';
    }
  }

  // Draw SVG inclined plane
  let baseX1 = 30, baseY = 205;
  let rampBase = 260;
  let rampHeight = Math.min(150, rampBase * Math.tan(rad));
  let apexX = 30, apexY = baseY - rampHeight;
  let rampCornerX = apexX + rampBase;

  // Block coordinates on ramp
  let tDist = 0.45 + (st.animOffset || 0);
  let bx = apexX + tDist * (rampCornerX - apexX);
  let by = apexY + tDist * (baseY - apexY);

  // Vector scaling
  let vScale = 0.55;
  let mgLen = Math.min(50, st.m * g * 0.28);
  let fnLen = Math.min(45, Fn * vScale * 0.4);
  let fgxLen = Math.min(45, Fgx * vScale * 0.4);
  let fkLen = Math.min(45, (isSliding ? Fk : Fgx) * vScale * 0.4);

  // Vector coordinates
  // Downhill unit vector: (cosT, sinT)
  // Perpendicular outward: (-sinT, -cosT)
  let fnX = bx - fnLen * sinT, fnY = by - fnLen * cosT;
  let fgxX = bx + fgxLen * cosT, fgxY = by + fgxLen * sinT;
  let fkX = bx - fkLen * cosT, fkY = by - fkLen * sinT;

  svg.innerHTML = `
    <!-- Ramp Surface -->
    <polygon points="${apexX},${baseY} ${rampCornerX},${baseY} ${apexX},${apexY}" fill="var(--soft)" stroke="var(--ink)" stroke-width="2"/>
    <!-- Ground Line -->
    <line x1="15" y1="${baseY}" x2="325" y2="${baseY}" stroke="var(--line)" stroke-width="2"/>
    <!-- Angle Arc -->
    <path d="M ${rampCornerX - 45},${baseY} A 45 45 0 0 0 ${rampCornerX - 45 * Math.cos(rad)},${baseY - 45 * Math.sin(rad)}" fill="none" stroke="var(--accent)" stroke-width="1.5"/>
    <text x="${rampCornerX - 40}" y="${baseY - 8}" font-size="10" font-weight="600" fill="var(--accent)">θ=${st.theta}°</text>

    <!-- Block -->
    <g transform="translate(${bx}, ${by}) rotate(${st.theta})">
      <rect x="-18" y="-22" width="36" height="22" rx="3" fill="var(--tint)" stroke="var(--accent)" stroke-width="2"/>
      <text x="-8" y="-8" font-size="9" font-weight="700" fill="var(--accent)">${st.m}kg</text>
    </g>

    <!-- Gravity Vector mg (Straight Down) -->
    <line x1="${bx}" y1="${by}" x2="${bx}" y2="${by + mgLen}" stroke="var(--ink)" stroke-width="2"/>
    <polygon points="${bx},${by + mgLen} ${bx - 3},${by + mgLen - 6} ${bx + 3},${by + mgLen - 6}" fill="var(--ink)"/>
    <text x="${bx + 4}" y="${by + mgLen}" font-size="9" font-weight="600" fill="var(--ink)">mg</text>

    <!-- Normal Force FN -->
    <line x1="${bx}" y1="${by}" x2="${fnX}" y2="${fnY}" stroke="#2b6cb0" stroke-width="2"/>
    <polygon points="${fnX},${fnY} ${fnX + 4 * cosT - 3 * sinT},${fnY + 4 * sinT + 3 * cosT} ${fnX - 4 * cosT - 3 * sinT},${fnY - 4 * sinT + 3 * cosT}" fill="#2b6cb0"/>
    <text x="${fnX - 12}" y="${fnY - 4}" font-size="9" font-weight="600" fill="#2b6cb0">F_N</text>

    <!-- Parallel Component Fgx (Down Incline) -->
    <line x1="${bx}" y1="${by}" x2="${fgxX}" y2="${fgxY}" stroke="#c84b31" stroke-width="2"/>
    <polygon points="${fgxX},${fgxY} ${fgxX - 3 * cosT + 3 * sinT},${fgxY - 3 * sinT - 3 * cosT} ${fgxX - 3 * cosT - 3 * sinT},${fgxY - 3 * sinT + 3 * cosT}" fill="#c84b31"/>
    <text x="${fgxX + 6}" y="${fgxY + 6}" font-size="9" font-weight="600" fill="#c84b31">F_gx</text>

    <!-- Friction Force fk (Up Incline) -->
    <line x1="${bx}" y1="${by}" x2="${fkX}" y2="${fkY}" stroke="#d69e2e" stroke-width="2"/>
    <polygon points="${fkX},${fkY} ${fkX + 3 * cosT + 3 * sinT},${fkY + 3 * sinT - 3 * cosT} ${fkX + 3 * cosT - 3 * sinT},${fkY + 3 * sinT + 3 * cosT}" fill="#d69e2e"/>
    <text x="${fkX - 14}" y="${fkY - 4}" font-size="9" font-weight="600" fill="#d69e2e">f_k</text>
  `;
}

// ================= Chem: 2D Molecule & Mechanism Explorer =================
function renderChemWidgetHTML(wId) {
  return `
  <div class="domain-widget" id="${wId}" data-type="chem">
    <div class="widget-head">
      <div class="widget-title">
        <svg style="width:16px;height:16px;color:var(--accent)"><circle cx="12" cy="12" r="3"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><path d="m14 10 3.5-2.5M6.5 16.5 10 14"/></svg>
        2D Organic Molecule & Reaction Mechanism Explorer
      </div>
      <div class="widget-ctrls">
        <span class="widget-badge status-ok">S_N2 Stereospecific Substitution</span>
      </div>
    </div>

    <!-- Reaction Stage Navigator -->
    <div class="chem-stages">
      <button class="chem-stage-btn active" data-chem-stage="1" data-wid="${wId}">1. Reactants (Backside Attack)</button>
      <button class="chem-stage-btn" data-chem-stage="2" data-wid="${wId}">2. Pentacoordinate Transition State</button>
      <button class="chem-stage-btn" data-chem-stage="3" data-wid="${wId}">3. Inverted Product & Leaving Group</button>
    </div>

    <!-- Mechanism SVG Canvas -->
    <div class="chem-svg-box">
      <svg id="${wId}-chem-svg" viewBox="0 0 520 200"></svg>
    </div>

    <!-- Clickable Atom Target Toolbar -->
    <div class="chem-atoms">
      <span class="small muted" style="margin-right:4px;line-height:24px">Inspect:</span>
      <button class="chem-atom-btn active" data-chem-atom="nu" data-wid="${wId}">Nucleophile (:OH⁻)</button>
      <button class="chem-atom-btn" data-chem-atom="ca" data-wid="${wId}">Electrophilic Carbon (C_α)</button>
      <button class="chem-atom-btn" data-chem-atom="br" data-wid="${wId}">Leaving Group (−Br)</button>
      <button class="chem-atom-btn" data-chem-atom="arrow" data-wid="${wId}">Curved Electron Arrow</button>
    </div>

    <!-- Inspector Panel -->
    <div class="chem-inspect" id="${wId}-chem-inspect"></div>
  </div>
  `;
}

function updateChemWidget(wId) {
  let st = widgetStates[wId] || { stage: 1, atom: 'nu' };
  widgetStates[wId] = st;
  const svg = document.getElementById(`${wId}-chem-svg`);
  const inspect = document.getElementById(`${wId}-chem-inspect`);
  if (!svg || !inspect) return;

  // Stage button classes
  const el = document.getElementById(wId);
  if (el) {
    el.querySelectorAll('.chem-stage-btn').forEach(btn => btn.classList.toggle('active', +btn.dataset.chemStage === st.stage));
    el.querySelectorAll('.chem-atom-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.chemAtom === st.atom));
  }

  // Draw mechanism SVG by stage
  if (st.stage === 1) {
    // Stage 1: Reactants backside approach
    svg.innerHTML = `
      <!-- Nucleophile OH- -->
      <g id="${wId}-svg-nu" style="cursor:pointer">
        <circle cx="95" cy="100" r="18" fill="var(--tint)" stroke="var(--accent)" stroke-width="2"/>
        <text x="86" y="105" font-size="14" font-weight="700" fill="var(--ink)">:OH⁻</text>
        <text x="88" y="76" font-size="10" font-weight="700" fill="#c84b31">δ⁻</text>
      </g>

      <!-- Curved Arrow: Nu to C_alpha -->
      <path d="M 115 95 Q 165 60 215 95" fill="none" stroke="#c84b31" stroke-width="2.5" stroke-dasharray="${st.atom==='arrow'?'none':'none'}"/>
      <polygon points="215,95 204,90 207,100" fill="#c84b31"/>
      <text x="145" y="70" font-size="10" font-weight="650" fill="#c84b31">Backside Attack (180°)</text>

      <!-- Central Electrophilic Carbon (R)-2-bromobutane -->
      <circle cx="230" cy="100" r="16" fill="var(--bg)" stroke="var(--ink)" stroke-width="2"/>
      <text x="223" y="105" font-size="14" font-weight="700" fill="var(--ink)">C_α</text>
      <text x="224" y="76" font-size="10" font-weight="700" fill="#2b6cb0">δ⁺</text>

      <!-- Ligands on C_alpha (Tetrahedral R-configuration) -->
      <!-- CH3 Wedge Up -->
      <polygon points="230,84 218,45 228,45" fill="var(--ink)"/>
      <text x="210" y="38" font-size="11" font-weight="600" fill="var(--ink)">−CH₃</text>
      <!-- H Dash Down -->
      <line x1="230" y1="116" x2="225" y2="155" stroke="var(--ink)" stroke-width="2" stroke-dasharray="2,2"/>
      <text x="220" y="170" font-size="11" font-weight="600" fill="var(--ink)">−H</text>
      <!-- Ethyl Chain -->
      <line x1="230" y1="100" x2="280" y2="145" stroke="var(--ink)" stroke-width="2.5"/>
      <text x="285" y="155" font-size="11" font-weight="600" fill="var(--ink)">−CH₂CH₃</text>

      <!-- Leaving Group C-Br Bond -->
      <line x1="246" y1="100" x2="350" y2="100" stroke="var(--ink)" stroke-width="2.5"/>
      <!-- Curved Arrow: C-Br bond cleavage to Br -->
      <path d="M 290 95 Q 325 75 355 92" fill="none" stroke="#c84b31" stroke-width="2"/>
      <polygon points="355,92 344,88 348,97" fill="#c84b31"/>

      <!-- Leaving Group Br -->
      <circle cx="370" cy="100" r="18" fill="var(--soft)" stroke="var(--ink)" stroke-width="2"/>
      <text x="360" y="105" font-size="14" font-weight="700" fill="var(--ink)">−Br</text>
      <text x="365" y="76" font-size="10" font-weight="700" fill="#c84b31">δ⁻</text>
    `;
  } else if (st.stage === 2) {
    // Stage 2: Pentacoordinate Transition State
    svg.innerHTML = `
      <!-- TS Brackets and Dagger -->
      <path d="M 110 35 H 90 V 165 H 110" fill="none" stroke="var(--muted)" stroke-width="2"/>
      <path d="M 390 35 H 410 V 165 H 390" fill="none" stroke="var(--muted)" stroke-width="2"/>
      <text x="415" y="45" font-size="18" font-weight="700" fill="var(--accent)">‡</text>
      <text x="415" y="65" font-size="12" font-weight="700" fill="var(--ink)">[−1]</text>

      <!-- Partial Forming Bond HO ··· C -->
      <text x="125" y="105" font-size="13" font-weight="700" fill="var(--ink)">HO</text>
      <text x="128" y="80" font-size="10" font-weight="700" fill="#c84b31">δ⁻ (0.5−)</text>
      <line x1="150" y1="100" x2="225" y2="100" stroke="#c84b31" stroke-width="2.5" stroke-dasharray="4,3"/>

      <!-- Central Planar sp2-like Carbon -->
      <circle cx="245" cy="100" r="16" fill="var(--mark)" stroke="var(--ink)" stroke-width="2"/>
      <text x="238" y="105" font-size="13" font-weight="700" fill="var(--ink)">C_α</text>
      <text x="240" y="75" font-size="10" font-weight="700" fill="#2b6cb0">sp²-like</text>

      <!-- Planar Equatorial Ligands (120° arrangement) -->
      <line x1="245" y1="84" x2="245" y2="45" stroke="var(--ink)" stroke-width="2"/>
      <text x="235" y="38" font-size="11" font-weight="600" fill="var(--ink)">−CH₃</text>
      <line x1="245" y1="116" x2="220" y2="155" stroke="var(--ink)" stroke-width="2"/>
      <text x="210" y="170" font-size="11" font-weight="600" fill="var(--ink)">−H</text>
      <line x1="245" y1="116" x2="270" y2="155" stroke="var(--ink)" stroke-width="2"/>
      <text x="265" y="170" font-size="11" font-weight="600" fill="var(--ink)">−CH₂CH₃</text>

      <!-- Partial Breaking Bond C ··· Br -->
      <line x1="261" y1="100" x2="335" y2="100" stroke="#c84b31" stroke-width="2.5" stroke-dasharray="4,3"/>
      <text x="345" y="105" font-size="13" font-weight="700" fill="var(--ink)">Br</text>
      <text x="345" y="80" font-size="10" font-weight="700" fill="#c84b31">δ⁻ (0.5−)</text>
      <text x="180" y="190" font-size="10" font-weight="600" fill="var(--muted)">Trigonal Bipyramidal Geometry (Simultaneous Bond Form & Break)</text>
    `;
  } else if (st.stage === 3) {
    // Stage 3: Inverted Product (Walden Inversion)
    svg.innerHTML = `
      <!-- Formed OH bond on left -->
      <text x="95" y="105" font-size="14" font-weight="700" fill="var(--accent)">HO−</text>
      <line x1="125" y1="100" x2="195" y2="100" stroke="var(--accent)" stroke-width="2.5"/>

      <!-- Inverted Central Carbon (S)-butan-2-ol -->
      <circle cx="210" cy="100" r="16" fill="var(--tint)" stroke="var(--ink)" stroke-width="2"/>
      <text x="203" y="105" font-size="13" font-weight="700" fill="var(--ink)">C_α</text>

      <!-- Flipped Umbrella Ligands (Tilted Right) -->
      <polygon points="210,84 225,45 235,45" fill="var(--ink)"/>
      <text x="235" y="42" font-size="11" font-weight="600" fill="var(--ink)">−CH₃</text>
      <line x1="210" y1="116" x2="225" y2="155" stroke="var(--ink)" stroke-width="2" stroke-dasharray="2,2"/>
      <text x="225" y="170" font-size="11" font-weight="600" fill="var(--ink)">−H</text>
      <line x1="210" y1="100" x2="270" y2="135" stroke="var(--ink)" stroke-width="2.5"/>
      <text x="275" y="145" font-size="11" font-weight="600" fill="var(--ink)">−CH₂CH₃</text>

      <!-- Detached Bromide Ion Leaving Group -->
      <circle cx="395" cy="100" r="20" fill="var(--soft)" stroke="var(--ink)" stroke-width="2"/>
      <text x="382" y="105" font-size="14" font-weight="700" fill="var(--ink)">:Br⁻</text>
      <text x="365" y="140" font-size="10" font-weight="650" fill="var(--muted)">Solvated Leaving Group</text>
      <text x="135" y="190" font-size="10" font-weight="600" fill="var(--accent)">100% Inverted Configuration: (2R) ⟶ (2S)-butan-2-ol</text>
    `;
  }

  // Atom inspection metadata
  let atomData = {
    nu: {
      name: 'Nucleophile: Hydroxide Ion (:OH⁻)',
      role: 'Strong hard nucleophile with high-energy HOMO electron lone pair.',
      hybrid: 'sp³ oxygen with full negative charge (−1)',
      partial: 'Charge: −1.00 (Reactant) ⟶ −0.50 (TS) ⟶ 0.00 (Formed alcohol)',
      stereo: 'Enters 180° opposite departing bromide (backside trajectory)'
    },
    ca: {
      name: 'Electrophilic Substrate Carbon (C_α)',
      role: 'Chiral center bearing polar carbon-bromine bond.',
      hybrid: 'sp³ (tetrahedral) ⟶ sp²-like (planar TS) ⟶ sp³ (inverted tetrahedral)',
      partial: 'Partial positive δ⁺ due to electronegativity difference (Δχ = 2.8 − 2.5 = 0.3)',
      stereo: 'Undergoes 100% Walden Umbrella Inversion: (2R) ⟶ (2S)'
    },
    br: {
      name: 'Leaving Group: Bromide (−Br)',
      role: 'Weak conjugate base of strong acid HBr (pKa ≈ −9), excellent leaving capability.',
      hybrid: 'sp³ halogen with 3 lone pairs ⟶ departs as free solvated :Br⁻',
      partial: 'Charge: −0.30 (polar bond) ⟶ −0.50 (TS) ⟶ −1.00 (Bromide anion)',
      stereo: 'Departs along the attack axis away from incoming nucleophile'
    },
    arrow: {
      name: 'Curved Electron-Pushing Arrow Pair',
      role: 'Depicts concerted bimolecular 2-electron transfers.',
      hybrid: 'Frontier Orbital Interaction: HOMO (:OH⁻ lone pair) ⟶ LUMO (C−Br σ* antibonding)',
      partial: 'No intermediate carbocation formed; synchronous bond making & breaking',
      stereo: 'Strict backside geometry required by σ* LUMO lobe symmetry'
    }
  };

  let curAtom = atomData[st.atom] || atomData.nu;
  inspect.innerHTML = `
    <div style="font-weight:600;color:var(--accent);margin-bottom:4px">${curAtom.name}</div>
    <div class="muted">${curAtom.role}</div>
    <div class="chem-inspect-grid">
      <div class="chem-item"><small>Hybridization State</small><strong>${curAtom.hybrid}</strong></div>
      <div class="chem-item"><small>Partial Charge Status</small><strong>${curAtom.partial}</strong></div>
      <div class="chem-item"><small>Stereochemical Dynamic</small><strong>${curAtom.stereo}</strong></div>
    </div>
  `;
}

// ================= Bio: Cellular Pathway & Feedback Inhibition Flow Map =================
function renderBioWidgetHTML(wId) {
  return `
  <div class="domain-widget" id="${wId}" data-type="bio">
    <div class="widget-head">
      <div class="widget-title">
        <svg style="width:16px;height:16px;color:var(--accent)"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.5 8.5 15.5 15.5"/></svg>
        Cellular Pathway & Allosteric Feedback Flow Map
      </div>
      <div class="widget-ctrls">
        <span class="widget-badge status-ok" id="${wId}-bio-status">Pathway Active (High Flux)</span>
      </div>
    </div>

    <!-- Allosteric Inhibition Switch -->
    <div class="bio-toggle-bar">
      <div class="bio-toggle-label">
        <svg style="width:15px;height:15px;color:#c84b31"><path d="M12 2v20M2 12h20"/></svg>
        High ATP / Citrate (Allosteric Feedback Inhibition)
      </div>
      <label class="switch">
        <input type="checkbox" id="${wId}-inhibit-toggle" data-wid="${wId}">
        <span class="slider-switch"></span>
      </label>
    </div>

    <!-- Compartment SVG Flow Map -->
    <div class="bio-map-box">
      <svg id="${wId}-bio-svg" viewBox="0 0 520 220"></svg>
    </div>

    <!-- Stage Selector Pills -->
    <div class="bio-stages-bar">
      <span class="small muted" style="margin-right:4px;line-height:24px">Inspect Stage:</span>
      <button class="bio-stage-pill active" data-bio-stage="1" data-wid="${wId}">1. Glycolysis</button>
      <button class="bio-stage-pill" data-bio-stage="2" data-wid="${wId}">2. Pyruvate Oxidation</button>
      <button class="bio-stage-pill" data-bio-stage="3" data-wid="${wId}">3. Citric Acid Cycle</button>
      <button class="bio-stage-pill" data-bio-stage="4" data-wid="${wId}">4. ETC & ATP Synthase</button>
    </div>

    <!-- Detailed Stage Inspector -->
    <div class="bio-detail-card" id="${wId}-bio-detail"></div>
  </div>
  `;
}

function updateBioWidget(wId) {
  let st = widgetStates[wId] || { stage: 1, inhibited: false };
  widgetStates[wId] = st;
  const svg = document.getElementById(`${wId}-bio-svg`);
  const detail = document.getElementById(`${wId}-bio-detail`);
  const statusBadge = document.getElementById(`${wId}-bio-status`);
  if (!svg || !detail) return;

  const el = document.getElementById(wId);
  if (el) {
    el.querySelectorAll('.bio-stage-pill').forEach(btn => btn.classList.toggle('active', +btn.dataset.bioStage === st.stage));
    const chk = document.getElementById(`${wId}-inhibit-toggle`);
    if (chk) chk.checked = st.inhibited;
  }

  if (statusBadge) {
    if (st.inhibited) {
      statusBadge.textContent = 'PFK-1 Throttled (~85% Inhibition)';
      statusBadge.className = 'widget-badge status-warn';
    } else {
      statusBadge.textContent = 'Normal Flux (PFK-1 Active)';
      statusBadge.className = 'widget-badge status-ok';
    }
  }

  // Draw Compartments and Stages SVG
  // Compartment 1: Cytosol [10, 10 to 160, 210]
  // Compartment 2: Mitochondrial Matrix [175, 10 to 355, 210]
  // Compartment 3: Inner Membrane / ETC [370, 10 to 510, 210]
  let arrowStroke = st.inhibited ? 'var(--line)' : 'var(--accent)';
  let arrowDash = st.inhibited ? '4,3' : 'none';

  svg.innerHTML = `
    <!-- Cytosol Compartment -->
    <rect x="10" y="25" width="145" height="180" rx="8" fill="var(--bg)" stroke="var(--line)" stroke-width="1.5"/>
    <text x="20" y="42" font-size="10" font-weight="700" fill="var(--muted)">CYTOSOL</text>

    <!-- Mitochondrial Outer Membrane Barrier -->
    <rect x="165" y="25" width="345" height="180" rx="8" fill="var(--soft)" stroke="var(--line)" stroke-width="1.5"/>
    <text x="175" y="42" font-size="10" font-weight="700" fill="var(--muted)">MITOCHONDRION (Matrix & Membrane)</text>

    <!-- Stage 1: Glycolysis Node -->
    <g class="bio-node" data-bio-stage="1" style="cursor:pointer">
      <rect x="20" y="60" width="125" height="65" rx="6" fill="${st.stage===1?'var(--mark)':'var(--rail)'}" stroke="${st.inhibited?'#c84b31':'var(--accent)'}" stroke-width="${st.stage===1?2:1.5}"/>
      <text x="30" y="80" font-size="11" font-weight="700" fill="var(--ink)">1. Glycolysis</text>
      <text x="30" y="96" font-size="9" fill="var(--muted)">Glucose ⟶ 2 Pyruvate</text>
      <text x="30" y="112" font-size="9" font-weight="600" fill="${st.inhibited?'#c84b31':'var(--accent)'}">PFK-1: ${st.inhibited?'INHIBITED':'ACTIVE'}</text>
    </g>

    <!-- Arrow 1 to 2 -->
    <path d="M 145 92 L 180 92" stroke="${arrowStroke}" stroke-width="2" stroke-dasharray="${arrowDash}"/>
    <polygon points="180,92 172,88 172,96" fill="${arrowStroke}"/>

    <!-- Stage 2: Pyruvate Oxidation -->
    <g class="bio-node" data-bio-stage="2" style="cursor:pointer">
      <rect x="180" y="60" width="135" height="42" rx="6" fill="${st.stage===2?'var(--mark)':'var(--bg)'}" stroke="var(--line)" stroke-width="${st.stage===2?2:1}"/>
      <text x="190" y="78" font-size="11" font-weight="700" fill="var(--ink)">2. Pyruvate Oxid.</text>
      <text x="190" y="93" font-size="9" fill="var(--muted)">Pyruvate ⟶ Acetyl-CoA</text>
    </g>

    <!-- Arrow 2 to 3 -->
    <path d="M 245 102 L 245 125" stroke="${arrowStroke}" stroke-width="2" stroke-dasharray="${arrowDash}"/>
    <polygon points="245,125 241,117 249,117" fill="${arrowStroke}"/>

    <!-- Stage 3: Citric Acid Cycle (Krebs) -->
    <g class="bio-node" data-bio-stage="3" style="cursor:pointer">
      <rect x="180" y="125" width="135" height="65" rx="6" fill="${st.stage===3?'var(--mark)':'var(--bg)'}" stroke="var(--line)" stroke-width="${st.stage===3?2:1}"/>
      <text x="190" y="145" font-size="11" font-weight="700" fill="var(--ink)">3. Citric Acid Cycle</text>
      <text x="190" y="161" font-size="9" fill="var(--muted)">6 NADH + 2 FADH₂</text>
      <text x="190" y="177" font-size="9" font-weight="600" fill="var(--accent)">+2 ATP / GTP</text>
    </g>

    <!-- Arrow 3 to 4 -->
    <path d="M 315 155 L 340 155 L 340 92 L 350 92" stroke="${arrowStroke}" stroke-width="2" stroke-dasharray="${arrowDash}" fill="none"/>
    <polygon points="350,92 342,88 342,96" fill="${arrowStroke}"/>

    <!-- Stage 4: ETC & ATP Synthase -->
    <g class="bio-node" data-bio-stage="4" style="cursor:pointer">
      <rect x="350" y="60" width="145" height="130" rx="6" fill="${st.stage===4?'var(--mark)':'var(--bg)'}" stroke="var(--line)" stroke-width="${st.stage===4?2:1}"/>
      <text x="360" y="80" font-size="11" font-weight="700" fill="var(--ink)">4. ETC & Chemiosmosis</text>
      <text x="360" y="98" font-size="9" fill="var(--muted)">Proton Gradient H⁺ Pump</text>
      <text x="360" y="120" font-size="10" font-weight="700" fill="var(--accent)">F₀F₁ ATP Synthase</text>
      <rect x="360" y="135" width="125" height="42" rx="4" fill="var(--tint)"/>
      <text x="368" y="152" font-size="9" fill="var(--muted)">Cumulative Yield:</text>
      <text x="368" y="168" font-size="12" font-weight="800" fill="var(--accent)">30–32 ATP / glucose</text>
    </g>

    <!-- Allosteric Inhibition Curved Loop Arrow -->
    ${st.inhibited ? `
      <path d="M 420 60 C 420 15, 80 15, 80 58" fill="none" stroke="#c84b31" stroke-width="2.5" stroke-dasharray="4,2"/>
      <!-- Blunt Inhibitory Head (T-bar) -->
      <line x1="72" y1="58" x2="88" y2="58" stroke="#c84b31" stroke-width="3.5"/>
      <rect x="180" y="5" width="200" height="18" rx="4" fill="#fff3f0" stroke="#c84b31"/>
      <text x="188" y="18" font-size="9.5" font-weight="700" fill="#c84b31">Allosteric Negative Feedback (PFK-1 Blocked)</text>
    ` : ''}
  `;

  // Stage Inspector Metadata
  let stageDetails = {
    1: {
      name: 'Stage 1: Glycolysis (Cytosol)',
      enzyme: 'Phosphofructokinase-1 (PFK-1)',
      inputs: '1 Glucose (C₆), 2 NAD⁺, 2 ADP + 2 Pᵢ',
      outputs: '2 Pyruvate (C₃), 2 NADH, 2 ATP (net)',
      atp: '+2 ATP (Substrate-level phosphorylation)',
      regulation: st.inhibited
        ? 'High ATP binds allosteric regulatory site ⟶ shifts enzyme to T-state ⟶ low F6P affinity ⟶ rate throttled ~85%.'
        : 'Stimulated by high AMP / ADP (low cellular energy charge) to replenish ATP reserves.'
    },
    2: {
      name: 'Stage 2: Pyruvate Oxidation (Mitochondrial Matrix)',
      enzyme: 'Pyruvate Dehydrogenase Complex (PDH)',
      inputs: '2 Pyruvate, 2 Coenzyme A, 2 NAD⁺',
      outputs: '2 Acetyl-CoA (C₂), 2 CO₂, 2 NADH',
      atp: '+0 ATP directly (Yields 2 NADH for downstream ETC)',
      regulation: 'Inhibited by acetyl-CoA, NADH, and ATP; activated by pyruvate, ADP, and Ca²⁺.'
    },
    3: {
      name: 'Stage 3: Citric Acid Cycle / Krebs (Matrix)',
      enzyme: 'Isocitrate Dehydrogenase / Citrate Synthase',
      inputs: '2 Acetyl-CoA, 6 NAD⁺, 2 FAD, 2 GDP + 2 Pᵢ',
      outputs: '4 CO₂, 6 NADH, 2 FADH₂, 2 GTP/ATP',
      atp: '+2 ATP / GTP (Substrate-level phosphorylation)',
      regulation: 'Inhibited by high ATP and high NADH/NAD⁺ ratio; provides high-energy electron carriers.'
    },
    4: {
      name: 'Stage 4: Electron Transport Chain & Oxidative Phosphorylation',
      enzyme: 'Complexes I–IV & F₀F₁ ATP Synthase',
      inputs: '10 NADH, 2 FADH₂, 6 O₂, ~26–28 ADP',
      outputs: '6 H₂O, 10 NAD⁺, 2 FAD, ~26–28 ATP',
      atp: '~26–28 ATP (Chemiosmosis via electrochemical proton gradient)',
      regulation: 'Coupled to oxygen reduction; total aerobic yield reaches 30 to 32 ATP per oxidized glucose.'
    }
  };

  let curStage = stageDetails[st.stage] || stageDetails[1];
  detail.innerHTML = `
    <div style="font-weight:700;color:var(--accent);margin-bottom:4px">${curStage.name}</div>
    <div class="bio-detail-grid">
      <div class="bio-card-item"><small>Key Regulatory Enzyme</small><strong>${curStage.enzyme}</strong></div>
      <div class="bio-card-item"><small>Substrate Inputs</small><strong>${curStage.inputs}</strong></div>
      <div class="bio-card-item"><small>Outputs Generated</small><strong>${curStage.outputs}</strong></div>
      <div class="bio-card-item"><small>ATP Contribution</small><strong>${curStage.atp}</strong></div>
    </div>
    <div style="margin-top:8px;font-size:11px" class="muted"><strong>Allosteric Status:</strong> ${curStage.regulation}</div>
  `;
}

/* -------------------------------------------------------------
   Studio Tabs & Views Controller
------------------------------------------------------------- */
let currentLabFeature = 'cs';
let workbenchTab = 'lab';

function renderWorkbenchLab(feat) {
  if (!feat || !ALL_SUBJECTS[feat]) feat = currentSubjectKey || 'cs';
  currentLabFeature = feat;
  let sub = ALL_SUBJECTS[feat] || activeSubject;

  let labView = $('#workbench-lab-view');
  if (!labView) return;

  let wId = `workbench-tool-${feat}`;
  let toolHTML = '';
  if (feat === 'cs') toolHTML = renderCSWidgetHTML(wId);
  else if (feat === 'math') toolHTML = renderMathWidgetHTML(wId);
  else if (feat === 'physics') toolHTML = renderPhysicsWidgetHTML(wId);
  else if (feat === 'chem') toolHTML = renderChemWidgetHTML(wId);
  else if (feat === 'bio') toolHTML = renderBioWidgetHTML(wId);

  labView.innerHTML = `
    <div class="lab-subheader">
      <div class="inline" style="justify-content:space-between;width:100%;margin-bottom:6px">
        <div>
          <span class="eyebrow">STUDIO LABORATORY</span>
          <h3 style="margin:2px 0 0;font-size:16px;font-weight:600" id="benchtooltag">${sub.toolTitle}</h3>
        </div>
        <span class="tool-mount-pill" id="chatheadpill">${sub.toolPill}</span>
      </div>
    </div>
    ${toolHTML}
  `;

  // Synchronous initialization so DOM/SVGs are populated immediately
  if (feat === 'cs') updateCSWidget(wId);
  else if (feat === 'math') updateMathWidget(wId);
  else if (feat === 'physics') updatePhysicsWidget(wId);
  else if (feat === 'chem') updateChemWidget(wId);
  else if (feat === 'bio') updateBioWidget(wId);
}

function renderPassageView() {
  let pasView = $('#workbench-passage-view');
  if (!pasView) return;
  let p = passages[citation] || passages[1];
  let s = sources.find(src => src.id === p.source) || sources[0];
  pasView.innerHTML = `
    <div class="eyebrow">Citation ${citation} · ${esc(activeSubject.code)}</div>
    <div class="documenttitle">${esc(s?.title || 'Course source document')}</div>
    <div class="docmeta">${esc(s?.meta || 'PDF Excerpt')} · Verified Subject Passage</div>
    <div class="pagebar">
      <span>Page ${p.page} of 32</span>
      <span class="inline">
        <button class="icon mini-icon" data-prev aria-label="Previous citation">${icon('back')}</button>
        <button class="icon mini-icon" data-next aria-label="Next citation">${icon('chevron')}</button>
      </span>
    </div>
    <div class="paper">
      <div class="coursecode">${esc(activeSubject.fullName.toUpperCase())}</div>
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.text)}</p>
      <p><mark>${esc(p.highlight)}</mark></p>
      <p>${esc(p.after)}</p>
      <div class="pagenum">${p.page}</div>
    </div>
    <div class="passagehint"><i></i>Passage directly supporting interactive answer claim</div>
    <button class="savepassage inline" id="savepassage">${icon('note')}Save passage to note</button>
  `;
}

function setWorkbenchTab(tab) {
  workbenchTab = tab;
  let labTab = $('#labtab'), citTab = $('#citationtab'), notesTab = $('#notestab');
  let labView = $('#workbench-lab-view'), pasView = $('#workbench-passage-view'), notesView = $('#workbench-notes-view');

  if (labTab) labTab.classList.toggle('selected', tab === 'lab');
  if (citTab) citTab.classList.toggle('selected', tab === 'passage');
  if (notesTab) notesTab.classList.toggle('selected', tab === 'notes');

  if (labView) labView.style.display = (tab === 'lab') ? 'block' : 'none';
  if (pasView) pasView.style.display = (tab === 'passage') ? 'block' : 'none';
  if (notesView) notesView.style.display = (tab === 'notes') ? 'flex' : 'none';

  if (tab === 'lab') {
    renderWorkbenchLab(currentLabFeature);
  } else if (tab === 'passage') {
    renderPassageView();
  } else if (tab === 'notes') {
    renderNotesDock();
  }
}

function renderNotesDock() {
  let countEl = $('#docknotecount');
  if (countEl) countEl.textContent = notes.length;

  let dockList = $('#docknoteslist');
  if (!dockList) return;

  if (notes.length === 0) {
    dockList.innerHTML = `<div class="empty-notes muted small" style="padding:16px 0;text-align:center">No study notes yet. Use the scratchpad above or click Add note.</div>`;
    return;
  }

  dockList.innerHTML = notes.map((n, i) => `
    <article class="notecard">
      <div class="notecard-head">
        <h4>${esc(n.title)}</h4>
        <button class="mini-link" data-edit-note="${i}">Edit</button>
      </div>
      <p>${esc(n.text)}</p>
      <div class="notecard-footer">
        <small class="muted">${esc(n.source)}</small>
      </div>
    </article>
  `).join('');
}

/* -------------------------------------------------------------
   Clean Center Chat Answer Generator
------------------------------------------------------------- */
function createAssistantAnswer(kind, customQ = '') {
  let featureKey = kind.split('_')[0];
  if (!ALL_SUBJECTS[featureKey]) featureKey = currentSubjectKey;

  let explanationHTML = '';
  if (featureKey === 'cs') {
    explanationHTML = `
      <h2>A loop invariant connects each step to the proof.</h2>
      <p>A loop invariant is a predicate that remains true <strong>before and after every iteration</strong>. To establish full algorithmic correctness, verify the three standard proof obligations: ${cite(1, '1 · p.8')}</p>
      <p><strong>1. Initialization:</strong> The invariant holds prior to the first execution of the loop.<br>
      <strong>2. Maintenance:</strong> If the invariant holds before an iteration, executing the body preserves it for the next.<br>
      <strong>3. Termination:</strong> At loop exit, the invariant and exit condition guarantee the postcondition.</p>
      <div class="equation">sum = A[0] + A[1] + ··· + A[i − 1]</div>
      <p>Step through line-by-line in the Studio Lab to inspect visual array prefix memory <code>A[0 … i−1]</code> and track loop invariants across loop boundaries.</p>
    `;
  } else if (featureKey === 'math') {
    explanationHTML = `
      <h2>Step-by-step calculus derivations and dynamic geometric boundaries.</h2>
      <p>Mathematical rigor requires establishing each transformation from fundamental definitions. In Integration by Parts, applying the product rule yields: ${cite(1, '1 · p.7')}</p>
      <div class="equation">∫ u dv = u v − ∫ v du</div>
      <p>Open Studio Lab to unfold intermediate algebraic steps, inspect substitution rules, and adjust continuous parameters along the unified curve canvas.</p>
    `;
  } else if (featureKey === 'physics') {
    explanationHTML = `
      <h2>Force equilibrium and dynamics along inclined coordinate axes.</h2>
      <p>By tilting the coordinate frame along the surface, we decompose gravitational weight into parallel driving force and perpendicular normal reaction: ${cite(1, '1 · p.11')}</p>
      <div class="equation">F_{gx} = mg\sin\theta, \quad F_N = mg\cos\theta, \quad a = g(\sin\theta - \mu_k\cos\theta)</div>
      <p>Open Studio Lab to adjust ramp angle, mass, and friction coefficient with dynamic vector updates and live acceleration calculations.</p>
    `;
  } else if (featureKey === 'chem') {
    explanationHTML = `
      <h2>Concerted bimolecular substitution (S_N2) and stereochemical inversion.</h2>
      <p>In an S_N2 mechanism, backside nucleophilic attack into the σ* LUMO of 2-bromobutane occurs simultaneously with carbon-halogen bond cleavage: ${cite(1, '1 · p.9')}</p>
      <div class="equation">\text{Rate} = k[\text{substrate}][\text{Nu}^-], \quad [HO \cdots C_\alpha \cdots Br]^\ddagger</div>
      <p>Open Studio Lab to inspect transition state geometries, molecular orbital hybridization, and Walden inversion stereochemistry.</p>
    `;
  } else if (featureKey === 'bio') {
    explanationHTML = `
      <h2>Cellular respiration compartments and allosteric feedback regulation.</h2>
      <p>Aerobic respiration couples substrate-level phosphorylation with mitochondrial chemiosmosis across partitioned cellular compartments: ${cite(1, '1 · p.12')}</p>
      <div class="equation">\text{C}_6\text{H}_{12}\text{O}_6 + 6\text{O}_2 \longrightarrow 6\text{CO}_2 + 6\text{H}_2\text{O} + 30\text{--}32\text{ ATP}</div>
      <p>Open Studio Lab to trace metabolite flow across compartments and test allosteric feedback inhibition of Phosphofructokinase-1.</p>
    `;
  }

  let sub = ALL_SUBJECTS[featureKey] || activeSubject;
  return `
    <article class="answer">
      <div class="assistantlabel">
        ${icon('spark')} <span>NotebookSpace</span>
      </div>
      ${explanationHTML}
      <div class="actions">
        <button class="open-lab-btn" data-open-lab="${featureKey}">${icon('spark')}Open in Studio Lab →</button>
        <button class="pill-btn" data-save-answer>${icon('note')}Save to note</button>
        <button class="icon mini-icon" data-copy aria-label="Copy answer">${icon('copy')}</button>
        <button class="pill-btn" data-failure style="font-size:11px;color:var(--muted)">Try error state</button>
      </div>
    </article>
  `;
}

function questionForChat(c) {
  if (c.q) return c.q;
  return `Can you explain ${c.title} based on my course sources?`;
}

/* -------------------------------------------------------------
   Workspace Core Rendering Functions
------------------------------------------------------------- */
function renderSources() {
  let q = $('#sourcesearch').value.toLowerCase();
  let filtered = sources.filter(s => s.title.toLowerCase().includes(q));
  $('#sourcelist').innerHTML = filtered.map(s => `
    <div class="source">
      <span class="fileicon">${icon('file')}</span>
      <div class="sourceinfo">
        <button class="sourcetitle" data-preview="${s.id}">${esc(s.title)}</button>
        <small>${esc(s.meta)}</small>
      </div>
      <input type="checkbox" ${s.selected?'checked':''} data-source="${s.id}" aria-label="Select ${esc(s.title)}">
    </div>
  `).join('') || '<div class="source empty">No matching sources.</div>';

  let n = sources.filter(s => s.selected).length;
  $('#sourcecount').textContent = sources.length;
  $('#selectedcount').textContent = `${n} of ${sources.length} selected`;
  $('#scopetext').textContent = `${n} source${n===1?'':'s'}`;
  $('#selectall').textContent = n === sources.length ? 'Deselect all' : 'Select all';
  $('#composer .send').disabled = n === 0;
  $('#prompt').placeholder = n ? 'Ask a question about your sources…' : 'Select a source to start a question…';
  persist();
}

function renderChats() {
  $('#conversations').innerHTML = chats.map((c, i) => `
    <button class="conversation ${current===i?'active':''}" data-chat="${i}">
      ${icon('chat')}
      <span>${esc(c.title)}</span>
    </button>
  `).join('');
  let curChat = chats[current] || chats[0];
  $('#chattitle').textContent = curChat ? curChat.title : 'Chat';
  let lastExtra = curChat && curChat.extra && curChat.extra.length ? curChat.extra[curChat.extra.length - 1] : null;
  let feat = lastExtra ? lastExtra.feat : (curChat && curChat.kind ? curChat.kind.split('_')[0] : detectSubjectFeature(curChat ? curChat.title : '', sources));
  updateAutoMountPill(feat);
}

function renderMessages() {
  let c = chats[current] || chats[0];
  if (!c) {
    $('#messages').innerHTML = '<div class="answer"><h2>Ask anything about your sources.</h2><p class="muted">NotebookSpace grounds every explanation in your course material.</p></div>';
    return;
  }

  let lastExtra = c.extra && c.extra.length ? c.extra[c.extra.length - 1] : null;
  let feat = lastExtra ? lastExtra.feat : (c.kind ? c.kind.split('_')[0] : detectSubjectFeature(c.title, sources));
  updateAutoMountPill(feat);

  let followupsHTML = '';
  if (feat === 'cs') followupsHTML = '<button data-question="Trace invariant for array sum">Trace array sum invariant</button><button data-question="How does binary search maintain its interval?">Binary search interval</button>';
  else if (feat === 'math') followupsHTML = '<button data-question="Show tangent slope at inflection point">Show tangent slope</button><button data-question="Compare Riemann sum to exact integral">Riemann sum convergence</button>';
  else if (feat === 'physics') followupsHTML = '<button data-question="What angle causes block to slip?">Critical slip angle</button><button data-question="How does friction change acceleration?">Friction vs Acceleration</button>';
  else if (feat === 'chem') followupsHTML = '<button data-question="Inspect pentacoordinate transition state">Transition state geometry</button><button data-question="Why does Walden inversion occur?">Walden umbrella flip</button>';
  else if (feat === 'bio') followupsHTML = '<button data-question="Toggle PFK-1 allosteric inhibition">PFK-1 allosteric feedback</button><button data-question="Calculate total ATP yield">Net ATP synthesis</button>';

  $('#messages').innerHTML = `
    <div class="user">${esc(questionForChat(c))}</div>
    ${createAssistantAnswer(c.kind || feat)}
    <div class="followups">${followupsHTML}</div>
    ${c.extra.map((e, idx) => `
      <div class="user" style="margin-top:24px">${esc(e.q)}</div>
      ${e.failed ? `
        <div class="error" role="alert">
          The answer could not be generated. Your question is saved.
          <button data-retry="${idx}">Retry</button>
        </div>
      ` : createAssistantAnswer(e.feat || feat, e.q)}
    `).join('')}
  `;
}

function updateAutoMountPill(featureKey) {
  let sub = ALL_SUBJECTS[featureKey] || ALL_SUBJECTS[currentSubjectKey];
  let pillText = sub.toolPill;
  let pillEl = $('#chatheadpill');
  if (pillEl) pillEl.textContent = pillText;
  let tagEl = $('#benchtooltag');
  if (tagEl) tagEl.textContent = sub.toolTitle;
}

function openCitation(id) {
  citation = Math.max(1, Math.min(3, id));
  $('#shell').classList.remove('right-off');
  setWorkbenchTab('passage');
  document.querySelectorAll('[data-cite]').forEach(b => b.classList.toggle('active', +b.dataset.cite === citation));
}

let toastTimer;
function toast(t) {
  $('#toast').textContent = t;
  $('#toast').classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('on'), 2500);
}

function saveNote(title, text, source) {
  notes.unshift({ title, text, source });
  persist();
  renderNotesDock();
  $('#shell').classList.remove('right-off');
  setWorkbenchTab('notes');
  toast('Saved to study notes');
}

let priorFocus;
function modal(title, html) {
  priorFocus = document.activeElement;
  $('#modaltitle').textContent = title;
  $('#modalcontent').innerHTML = html;
  $('#modalback').hidden = false;
  setTimeout(() => ($('#modalcontent input') || $('#closemodal')).focus(), 0);
}
function closeModal() {
  $('#modalback').hidden = true;
  priorFocus?.focus();
}

/* -------------------------------------------------------------
   Subject Switcher Implementation
------------------------------------------------------------- */
function switchSubject(key) {
  if (!ALL_SUBJECTS[key]) return;
  currentSubjectKey = key;
  activeSubject = ALL_SUBJECTS[key];
  sources = subjectsStore[key].sources;
  chats = subjectsStore[key].chats;
  notes = subjectsStore[key].notes;
  passages = activeSubject.passages;
  current = 0;
  citation = 1;
  currentLabFeature = key;

  $('#coursename').textContent = activeSubject.name;
  let feat = detectSubjectFeature('', sources);
  updateAutoMountPill(feat);

  renderSources();
  renderChats();
  renderMessages();
  renderWorkbenchLab(key);
  renderPassageView();
  renderNotesDock();
  persist();
  closeModal();
  toast(`Switched to ${activeSubject.name}`);
}

function openSubjects() {
  let listHTML = Object.entries(ALL_SUBJECTS).map(([k, s]) => {
    let subData = subjectsStore[k] || s;
    let isActive = (k === currentSubjectKey);
    return `
      <button class="notebookbutton ${isActive?'active-subject':''}" data-switch-subject="${k}">
        ${isActive ? '<span class="subbadge">Active</span>' : ''}
        <strong>${esc(s.fullName)}</strong>
        <small>${subData.sources.length} sources · ${subData.chats.length} conversations · Studio Lab: ${esc(s.toolTitle)}</small>
      </button>
    `;
  }).join('');

  modal('Select Academic Subject', `
    <p>Choose an academic domain to mount its specialized interactive tracer & laboratory:</p>
    <div class="notebooks">${listHTML}</div>
  `);
}

function globalSearch() {
  modal('Search Workspace', `
    <input id="globalquery" placeholder="Find a source, conversation, or note" aria-label="Search all workspace content">
    <div class="searchresults" id="searchresults"></div>
    <p class="small muted">Search spans active course sources, notes, and interactive tools.</p>
  `);
  $('#globalquery').oninput = () => {
    let q = $('#globalquery').value.toLowerCase();
    let rows = [
      ...sources.map(s => ({ title: s.title, type: 'Source', id: s.id })),
      ...chats.map((c, i) => ({ title: c.title, type: 'Conversation', id: i })),
      ...notes.map((n, i) => ({ title: n.title, type: 'Note', id: i }))
    ].filter(r => r.title.toLowerCase().includes(q));
    $('#searchresults').innerHTML = rows.map(r => `
      <button class="result" style="width:100%;text-align:left" data-search-type="${r.type}" data-search-id="${r.id}">
        ${icon(r.type==='Source'?'file':r.type==='Note'?'note':'chat')}
        <span>${esc(r.title)}</span>
        <small>${r.type}</small>
      </button>
    `).join('') || '<p class="muted small">No matching items.</p>';
  };
  $('#globalquery').oninput();
}

function addSource() {
  modal('Add a source', `
    <p>Upload a file or add raw text to your subject library.</p>
    <label class="small">Source title<input id="source-title" placeholder="e.g. Lecture 06 · Dynamic Programming"></label>
    <label class="small">Text content<textarea id="source-text" placeholder="Paste course material or textbook passage…"></textarea></label>
    <button class="primary" id="save-source">${icon('plus')}Add text source</button>
    <div class="dropzone">
      <div class="inline">${icon('file')}File Upload Simulator</div>
      <p class="small muted">PDF or TXT</p>
      <input type="file" multiple accept=".pdf,.txt" id="fileupload" aria-label="Choose source files">
      <div id="uploadresults" aria-live="polite"></div>
    </div>
  `);
  $('#save-source').onclick = () => {
    let title = $('#source-title').value.trim(), text = $('#source-text').value.trim();
    if (!title || !text) { toast('Add a title and some text first'); return; }
    sources.push({ id: Date.now(), title, meta: 'Text · User source', selected: true });
    renderSources();
    closeModal();
    toast('Source added to subject');
  };
  $('#fileupload').onchange = () => {
    let files = Array.from($('#fileupload').files);
    $('#uploadresults').innerHTML = files.map(f => `<div class="result">${esc(f.name)}<small>Processing…</small></div>`).join('');
    setTimeout(() => {
      files.forEach(f => {
        if (/\.(pdf|txt)$/i.test(f.name)) sources.push({ id: Date.now() + Math.random(), title: f.name, meta: 'File · Uploaded source', selected: true });
      });
      renderSources();
      closeModal();
      toast('Sources imported');
    }, 600);
  };
}

function noteEditor(i) {
  let n = notes[i] || { title: '', text: '' };
  modal(i === undefined ? 'New note' : 'Edit note', `
    <input id="note-title" value="${esc(n.title)}" placeholder="Note title" aria-label="Note title">
    <textarea id="note-text" placeholder="Write a study note…" aria-label="Note text">${esc(n.text)}</textarea>
    <button class="primary" id="save-note">Save note</button>
  `);
  $('#save-note').onclick = () => {
    let title = $('#note-title').value.trim(), text = $('#note-text').value.trim();
    if (!title || !text) { toast('Give your note a title and text'); return; }
    if (i === undefined) notes.unshift({ title, text, source: `${activeSubject.code} · Personal note` });
    else notes[i] = { ...notes[i], title, text };
    persist();
    closeModal();
    renderNotesDock();
    $('#shell').classList.remove('right-off');
    setWorkbenchTab('notes');
    toast('Note saved');
  };
}

function send(q) {
  if (!q.trim()) return;
  if (!sources.some(s => s.selected)) { toast('Select at least one source'); return; }

  // Auto-detect subject feature from user question & sources!
  let detectedFeat = detectSubjectFeature(q, sources);
  updateAutoMountPill(detectedFeat);

  chats[current].extra.push({
    q: q.trim(),
    feat: detectedFeat
  });

  $('#prompt').value = '';
  renderMessages();
  $('#thread').scrollTop = $('#thread').scrollHeight;
  renderChats();

  // Auto-mount matching interactive tool in the studio panel
  currentLabFeature = detectedFeat;
  $('#shell').classList.remove('right-off');
  setWorkbenchTab('lab');
}

/* -------------------------------------------------------------
   Event Listeners & Delegations
------------------------------------------------------------- */
$('#composer').onsubmit = e => { e.preventDefault(); send($('#prompt').value); };
$('#prompt').onkeydown = e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send($('#prompt').value); }
};

$('#hideleft').onclick = () => $('#shell').classList.add('left-off');
$('#showleft').onclick = () => $('#shell').classList.remove('left-off');
$('#hideright').onclick = () => $('#shell').classList.add('right-off');

$('#labtab').onclick = () => setWorkbenchTab('lab');
$('#citationtab').onclick = () => setWorkbenchTab('passage');
$('#notestab').onclick = () => setWorkbenchTab('notes');
$('#dockaddnote').onclick = () => noteEditor();

const qInput = $('#quicknoteinput');
if (qInput) {
  qInput.onkeydown = e => {
    if (e.key === 'Enter' && qInput.value.trim()) {
      let val = qInput.value.trim();
      let title = val.length > 28 ? val.slice(0, 28) + '…' : val;
      saveNote(title, val, `${activeSubject.code} · Quick Scratchpad`);
      qInput.value = '';
    }
  };
}

$('#scope').onclick = () => { $('#shell').classList.remove('left-off'); $('#sourcesearch').focus(); };
$('#sourcesearch').oninput = renderSources;
$('#selectall').onclick = () => {
  let state = !sources.every(s => s.selected);
  sources.forEach(s => s.selected = state);
  renderSources();
};
$('#newchat').onclick = () => {
  chats.push({ title: 'New inquiry', kind: currentSubjectKey, extra: [] });
  current = chats.length - 1;
  renderChats();
  renderMessages();
  $('#prompt').focus();
};
$('#addsource').onclick = addSource;
$('#subjects').onclick = openSubjects;
$('#home').onclick = openSubjects;
$('#theme').onclick = () => document.body.classList.toggle('dark');
$('#closemodal').onclick = closeModal;
$('#modalback').onclick = e => { if (e.target === $('#modalback')) closeModal(); };

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); globalSearch(); }
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Tab' && !$('#modalback').hidden) {
    let controls = Array.from($('#modalback').querySelectorAll('button,input,textarea')).filter(el => !el.disabled);
    let first = controls[0], last = controls.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

document.addEventListener('change', e => {
  if (e.target.dataset.source) {
    let s = sources.find(src => src.id == e.target.dataset.source);
    if (s) s.selected = e.target.checked;
    renderSources();
  }
  // Bio Inhibit Switch
  if (e.target.id && e.target.id.endsWith('-inhibit-toggle')) {
    let wId = e.target.dataset.wid;
    let st = widgetStates[wId] || { stage: 1 };
    st.inhibited = e.target.checked;
    widgetStates[wId] = st;
    updateBioWidget(wId);
  }
});

document.addEventListener('input', e => {
  // Math slider inputs
  if (e.target.dataset.mathSlider) {
    let wId = e.target.dataset.wid;
    let prop = e.target.dataset.mathSlider;
    let st = widgetStates[wId] || { mode: 'calc1' };
    st[prop] = +e.target.value;
    widgetStates[wId] = st;
    updateMathWidget(wId);
  }
  // Physics slider inputs
  if (e.target.dataset.physSlider) {
    let wId = e.target.dataset.wid;
    let prop = e.target.dataset.physSlider;
    let st = widgetStates[wId] || { theta: 25, m: 5, mu: 0.25 };
    st[prop] = +e.target.value;
    widgetStates[wId] = st;
    updatePhysicsWidget(wId);
  }
});

document.addEventListener('click', e => {
  // Open Interactive Lab Button in Assistant Answer
  let openLabBtn = e.target.closest('[data-open-lab]');
  if (openLabBtn) {
    let feat = openLabBtn.dataset.openLab;
    $('#shell').classList.remove('right-off');
    currentLabFeature = feat;
    setWorkbenchTab('lab');
    let labView = $('#workbench-lab-view');
    if (labView) labView.scrollTop = 0;
    toast(`Opened in Studio Lab: ${ALL_SUBJECTS[feat]?.toolTitle || 'Interactive Tool'}`);
    return;
  }

  // Subject switcher
  let switchBtn = e.target.closest('[data-switch-subject]');
  if (switchBtn) {
    switchSubject(switchBtn.dataset.switchSubject);
    return;
  }

  let b = e.target.closest('button');
  if (!b) {
    // Check if clicked code-line in CS tracer
    let cl = e.target.closest('.code-line');
    if (cl && cl.dataset.wid) {
      let wId = cl.dataset.wid;
      let line = +cl.dataset.csLine;
      let targetStep = CS_STEPS.findIndex(s => s.line === line);
      if (targetStep >= 0) {
        widgetStates[wId] = { step: targetStep };
        updateCSWidget(wId);
      }
    }
    // Check if clicked bio node
    let bn = e.target.closest('.bio-node');
    if (bn && bn.dataset.bioStage) {
      let wId = bn.closest('.domain-widget').id;
      let st = widgetStates[wId] || { stage: 1 };
      st.stage = +bn.dataset.bioStage;
      widgetStates[wId] = st;
      updateBioWidget(wId);
    }
    return;
  }

  // CS Tracer buttons
  if (b.dataset.csAction) {
    let wId = b.dataset.wid;
    let act = b.dataset.csAction;
    let st = widgetStates[wId] || { step: 0 };
    if (act === 'prev') st.step = Math.max(0, st.step - 1);
    else if (act === 'next') st.step = Math.min(CS_STEPS.length - 1, st.step + 1);
    else if (act === 'reset') st.step = 0;
    widgetStates[wId] = st;
    updateCSWidget(wId);
    return;
  }

  // Math Unfold Derivation Step
  if (b.dataset.unfold) {
    let wId = b.dataset.wid;
    let drawer = document.getElementById(`${wId}-drawer-${b.dataset.unfold}`);
    if (drawer) {
      let isHidden = drawer.style.display === 'none';
      drawer.style.display = isHidden ? 'block' : 'none';
      b.textContent = isHidden ? '[− Hide intermediate algebra]' : '[+ Unfold intermediate algebra & rule]';
    }
    return;
  }

  // Math Tabs
  if (b.dataset.mathMode) {
    let wId = b.dataset.wid;
    let modeVal = b.dataset.mathMode;
    let st = widgetStates[wId] || {};
    st.mode = modeVal;
    widgetStates[wId] = st;
    const p = document.getElementById(wId);
    if (p) p.querySelectorAll('.math-tab').forEach(t => t.classList.toggle('active', t.dataset.mathMode === modeVal));
    updateMathWidget(wId);
    return;
  }

  // Chem stage buttons
  if (b.dataset.chemStage) {
    let wId = b.dataset.wid;
    let st = widgetStates[wId] || { stage: 1, atom: 'nu' };
    st.stage = +b.dataset.chemStage;
    widgetStates[wId] = st;
    updateChemWidget(wId);
    return;
  }

  // Chem atom buttons
  if (b.dataset.chemAtom) {
    let wId = b.dataset.wid;
    let st = widgetStates[wId] || { stage: 1, atom: 'nu' };
    st.atom = b.dataset.chemAtom;
    widgetStates[wId] = st;
    updateChemWidget(wId);
    return;
  }

  // Bio stage pills
  if (b.dataset.bioStage) {
    let wId = b.dataset.wid;
    let st = widgetStates[wId] || { stage: 1 };
    st.stage = +b.dataset.bioStage;
    widgetStates[wId] = st;
    updateBioWidget(wId);
    return;
  }

  // Citations & Notes
  if (b.dataset.cite) openCitation(+b.dataset.cite);
  if (b.dataset.preview) {
    let id = +b.dataset.preview;
    if (id <= 3 || (id >= 101 && id <= 503)) openCitation(1);
    else toast('This source has no excerpt in this demo');
  }
  if (b.dataset.chat !== undefined) {
    current = +b.dataset.chat;
    renderChats();
    renderMessages();
    $('#thread').scrollTop = 0;
  }
  if (b.hasAttribute('data-save-answer')) {
    saveNote(`${activeSubject.code} · Saved Checklist`, b.closest('.answer').innerText.split('Open in Studio Lab')[0].replace(/NotebookSpace.*?From your active sources/s, '').trim(), `Saved from ${activeSubject.name}`);
  }
  if (b.hasAttribute('data-copy')) {
    let text = b.closest('.answer').innerText.split('Open in Studio Lab')[0];
    navigator.clipboard?.writeText(text).then(() => toast('Answer copied')).catch(() => toast('Copy unavailable in this browser'));
  }
  if (b.dataset.question) send(b.dataset.question);
  if (b.hasAttribute('data-failure')) {
    chats[current].extra.push({ q: 'Verify edge condition proof', failed: true });
    renderMessages();
    $('#thread').scrollTop = $('#thread').scrollHeight;
  }
  if (b.dataset.retry !== undefined) {
    let turn = chats[current].extra[+b.dataset.retry];
    turn.failed = false;
    renderMessages();
    toast('Answer retried successfully');
  }
  if (b.id === 'savepassage') {
    let p = passages[citation] || passages[1];
    saveNote(p.title, p.highlight, `${activeSubject.code} · Page ${p.page}`);
  }
  if (b.dataset.editNote !== undefined) noteEditor(+b.dataset.editNote);
  if (b.hasAttribute('data-prev')) openCitation(citation === 1 ? 3 : citation - 1);
  if (b.hasAttribute('data-next')) openCitation(citation === 3 ? 1 : citation + 1);
  if (b.dataset.searchType) {
    let type = b.dataset.searchType, id = +b.dataset.searchId;
    closeModal();
    if (type === 'Source') openCitation(1);
    if (type === 'Conversation') { current = id; renderChats(); renderMessages(); }
    if (type === 'Note') {
      $('#shell').classList.remove('right-off');
      setWorkbenchTab('notes');
    }
  }
});

// Initialization
if (innerWidth <= 900) $('#shell').classList.add('right-off');
if (innerWidth <= 600) $('#shell').classList.add('left-off');
$('#coursename').textContent = activeSubject.name;
renderSources();
renderChats();
renderMessages();
renderWorkbenchLab(currentSubjectKey);
renderPassageView();
renderNotesDock();
</script>
</body>
</html>
'''

with open('dist/index.html', 'w', encoding='utf-8') as f:
    f.write(html_content.strip() + '\n')
print("Successfully wrote dist/index.html")

# Also update prototype directory if present
proto_path = "/Users/abhisingh/Documents/Codex/2026-10-11/netlify-app-asdk-app-691f1f8f72408191afdbbdf8242bdf86-check/prototypes/notebookspace/dist/index.html"
if os.path.exists(os.path.dirname(proto_path)):
    with open(proto_path, 'w', encoding='utf-8') as f:
        f.write(html_content.strip() + '\n')
    print("Successfully synchronized prototype dist/index.html")
