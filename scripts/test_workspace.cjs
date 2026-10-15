const path = require("path");
const fs = require('fs');
const { JSDOM } = require(path.resolve(__dirname, '../frontend/node_modules/jsdom'));

const html = fs.readFileSync('dist/index.html', 'utf8');

// Mock window and browser features
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'http://localhost:3000/'
});

const window = dom.window;
const document = window.document;

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`PASS: ${message}`);
  }
}

console.log('\n--- 1. Testing Initial State & Auto-Mounted CS Feature in Workbench Lab ---');
assert(document.querySelector('#coursename').textContent.includes('EECS 3101'), 'Initial coursename is EECS 3101');
assert(document.querySelector('#chatheadpill').textContent.includes('Auto-mounted: Line-by-Line Code Tracer'), 'Chathead pill shows Line-by-Line Code Tracer');
assert(document.querySelector('#benchtooltag').textContent.includes('Line-by-Line Code Tracer'), 'Workbench tag shows Line-by-Line Code Tracer');

const csWidget = document.querySelector('#workbench-lab-view .domain-widget[data-type="cs"]');
assert(csWidget, 'CS domain widget mounted in workbench lab');

console.log('\n--- 2. Testing CS Tracer Controls & Memory Invariants ---');
const wId = csWidget.id;
const nextBtn = csWidget.querySelector('[data-cs-action="next"]');
const prevBtn = csWidget.querySelector('[data-cs-action="prev"]');
const resetBtn = csWidget.querySelector('[data-cs-action="reset"]');

assert(nextBtn && prevBtn && resetBtn, 'CS tracer has Prev, Next, and Reset buttons');

// Initial step
let statusBadge = document.querySelector(`#${wId}-status`);
assert(statusBadge.textContent.includes('Holds at loop header'), 'Initial invariant status is Holds at loop header');
let proofInit = document.querySelector(`#${wId}-proof-init`);
assert(proofInit.classList.contains('active-proof'), 'Proof table row Initialize is active');

// Step 1: click next line
nextBtn.click();
assert(statusBadge.textContent.includes('Holds at loop header'), 'Step 1: Loop header invariant holds');

// Step 2: click next line (mid-body)
nextBtn.click();
assert(statusBadge.textContent.includes('Temporarily broken mid-body'), 'Step 2: Mid-body status is Temporarily broken mid-body');
let proofMaint = document.querySelector(`#${wId}-proof-maint`);
assert(proofMaint.classList.contains('active-proof'), 'Proof table row Maintain is active during mid-body');

// Click pseudocode line directly (e.g. line 5 return)
const line5 = csWidget.querySelector('[data-cs-line="5"]');
assert(line5, 'Pseudocode line 5 exists');
line5.click();
assert(statusBadge.textContent.includes('Terminated'), 'Jumping to line 5 sets status to Terminated');
let proofTerm = document.querySelector(`#${wId}-proof-term`);
assert(proofTerm.classList.contains('active-proof'), 'Proof table row Terminate is active');

// Reset button
resetBtn.click();
assert(statusBadge.textContent.includes('Holds at loop header'), 'Reset restores initial invariant state');

console.log('\n--- 3. Testing Subject Switcher (All 5 Subjects) ---');
const subjectsBtn = document.querySelector('#subjects');
subjectsBtn.click();

const modalBack = document.querySelector('#modalback');
assert(!modalBack.hidden, 'Subject switcher modal opened');

const mathSubBtn = document.querySelector('[data-switch-subject="math"]');
assert(mathSubBtn, 'Math subject button exists in modal');
mathSubBtn.click();

assert(modalBack.hidden, 'Modal closed after subject selection');
assert(document.querySelector('#coursename').textContent.includes('MATH 2015'), 'Course name updated to MATH 2015');
assert(document.querySelector('#chatheadpill').textContent.includes('Derivation Unfolder & Curve Lab'), 'Chathead pill updated to Derivation Unfolder & Curve Lab');

console.log('\n--- 4. Testing Math Derivation Unfolder & Unified Curve Canvas in Workbench ---');
const mathWidget = document.querySelector('#workbench-lab-view .domain-widget[data-type="math"]');
assert(mathWidget, 'Math domain widget mounted in workbench lab');
const mathWId = mathWidget.id;

// Test Unfold Drawer
const unfoldBtn1 = mathWidget.querySelector('[data-unfold="1"]');
assert(unfoldBtn1, 'Unfold step 1 button exists');
const drawer1 = document.querySelector(`#${mathWId}-drawer-1`);
assert(drawer1.style.display === 'none', 'Drawer 1 is initially hidden');
unfoldBtn1.click();
assert(drawer1.style.display === 'block', 'Drawer 1 expands when clicked');
assert(drawer1.textContent.includes('Integration by Parts Rule'), 'Drawer 1 contains Integration by Parts theorem');

// Test Curve Canvas Tabs
const calc2Tab = mathWidget.querySelector('[data-math-mode="calc2"]');
assert(calc2Tab, 'Calculus II tab exists');
calc2Tab.click();
assert(calc2Tab.classList.contains('active'), 'Calculus II tab is active');
let sliderB = mathWidget.querySelector('[data-math-slider="b"]');
assert(sliderB, 'Upper bound slider b exists in Calc II mode');

// Test Probability Mode
const probTab = mathWidget.querySelector('[data-math-mode="prob"]');
assert(probTab, 'Probability tab exists');
probTab.click();
assert(probTab.classList.contains('active'), 'Probability tab is active');
let sliderZ = mathWidget.querySelector('[data-math-slider="z"]');
assert(sliderZ, 'Z-score slider exists in Probability mode');

console.log('\n--- 5. Testing Physics Subject & Free-Body Lab in Workbench ---');
subjectsBtn.click();
document.querySelector('[data-switch-subject="physics"]').click();
assert(document.querySelector('#coursename').textContent.includes('PHYS 1800'), 'Course name updated to PHYS 1800');
assert(document.querySelector('#chatheadpill').textContent.includes('Free-Body Vector & Slider Lab'), 'Chathead pill updated to Free-Body Vector & Slider Lab');

const physWidget = document.querySelector('#workbench-lab-view .domain-widget[data-type="physics"]');
assert(physWidget, 'Physics widget mounted in workbench lab');
const physWId = physWidget.id;
const physSvg = document.querySelector(`#${physWId}-phys-svg`);
assert(physSvg && physSvg.innerHTML.length > 50, 'Physics SVG inclined plane diagram rendered');

// Test theta slider input
const thetaSlider = physWidget.querySelector('[data-phys-slider="theta"]');
thetaSlider.value = '45';
thetaSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
let fgxVal = document.querySelector(`#${physWId}-eq-fgx`).textContent;
assert(fgxVal.includes('N'), `Gravity component calculated: ${fgxVal}`);
let motionBadge = document.querySelector(`#${physWId}-motion-badge`);
assert(motionBadge.textContent.includes('Accelerating'), 'At 45 degrees, block accelerates');

console.log('\n--- 6. Testing Chemistry Subject & 2D Reaction Explorer in Workbench ---');
subjectsBtn.click();
document.querySelector('[data-switch-subject="chem"]').click();
assert(document.querySelector('#coursename').textContent.includes('CHEM 2020'), 'Course name updated to CHEM 2020');
assert(document.querySelector('#chatheadpill').textContent.includes('2D Molecule & Mechanism Viewer'), 'Chathead pill updated to 2D Molecule & Mechanism Viewer');

const chemWidget = document.querySelector('#workbench-lab-view .domain-widget[data-type="chem"]');
assert(chemWidget, 'Chemistry widget mounted in workbench lab');
const chemWId = chemWidget.id;

// Stage 2 TS
const stage2Btn = chemWidget.querySelector('[data-chem-stage="2"]');
assert(stage2Btn, 'Stage 2 Transition State button exists');
stage2Btn.click();
const chemSvg = document.querySelector(`#${chemWId}-chem-svg`);
assert(chemSvg.innerHTML.includes('‡') || chemSvg.innerHTML.includes('HO ··· C'), 'Transition state pentacoordinate complex rendered in SVG');

// Click Electrophilic Carbon
const caBtn = chemWidget.querySelector('[data-chem-atom="ca"]');
caBtn.click();
const chemInspect = document.querySelector(`#${chemWId}-chem-inspect`);
assert(chemInspect.textContent.includes('Electrophilic Substrate Carbon') && chemInspect.textContent.includes('Walden Umbrella Inversion'), 'Inspection panel shows hybridization and Walden inversion');

console.log('\n--- 7. Testing Biology Subject & Cellular Pathway Map in Workbench ---');
subjectsBtn.click();
document.querySelector('[data-switch-subject="bio"]').click();
assert(document.querySelector('#coursename').textContent.includes('BIOL 2020'), 'Course name updated to BIOL 2020');
assert(document.querySelector('#chatheadpill').textContent.includes('Cellular Pathway Flow Map'), 'Chathead pill updated to Cellular Pathway Flow Map');

const bioWidget = document.querySelector('#workbench-lab-view .domain-widget[data-type="bio"]');
assert(bioWidget, 'Biology widget mounted in workbench lab');
const bioWId = bioWidget.id;

// Toggle Allosteric Inhibition
const inhibitToggle = document.querySelector(`#${bioWId}-inhibit-toggle`);
assert(inhibitToggle, 'Allosteric inhibition switch exists');
inhibitToggle.checked = true;
inhibitToggle.dispatchEvent(new window.Event('change', { bubbles: true }));

const bioStatus = document.querySelector(`#${bioWId}-bio-status`);
assert(bioStatus.textContent.includes('PFK-1 Throttled'), 'PFK-1 status shows throttled inhibition');
const bioSvg = document.querySelector(`#${bioWId}-bio-svg`);
assert(bioSvg.innerHTML.includes('Allosteric Negative Feedback'), 'Inhibitory feedback loop drawn in SVG');

console.log('\n--- 8. Testing De-cluttered Chat Thread & Workbench Integration on Typed Prompts ---');
const promptInput = document.querySelector('#prompt');
const composer = document.querySelector('#composer');

// Ask a math question while currently on biology
promptInput.value = 'How do I calculate the area under this curve using Riemann sums and integrals?';
composer.dispatchEvent(new window.Event('submit', { bubbles: true }));

let messages = document.querySelectorAll('#messages .answer');
let lastAnswer = messages[messages.length - 1];

// Center chat answer must be decluttered (no inline .domain-widget)
assert(!lastAnswer.querySelector('.domain-widget'), 'Center chat thread is de-cluttered (no inline domain-widget in message)');

// Sleek Open Interactive Lab button exists inside assistant answer
const openLabBtn = lastAnswer.querySelector('[data-open-lab="math"]');
assert(openLabBtn, 'Assistant answer includes sleek Open Interactive Lab button (data-open-lab="math")');

// Asking math question auto-mounts Math Lab in top-right workbench
assert(document.querySelector('#workbench-lab-view .domain-widget[data-type="math"]'), 'Asking a math question auto-mounts Math Lab in top-right workbench card');
assert(document.querySelector('#chatheadpill').textContent.includes('Derivation Unfolder & Curve Lab'), 'Chathead pill auto-updated to Derivation Unfolder & Curve Lab');
assert(document.querySelector('#labtab').classList.contains('selected'), 'Interactive Lab tab is active in workbench card');

// Ask a physics question
promptInput.value = 'What is the friction force and acceleration of a block on an inclined plane?';
composer.dispatchEvent(new window.Event('submit', { bubbles: true }));

messages = document.querySelectorAll('#messages .answer');
lastAnswer = messages[messages.length - 1];
assert(!lastAnswer.querySelector('.domain-widget'), 'Physics answer has no inline widget clutter');
assert(lastAnswer.querySelector('[data-open-lab="physics"]'), 'Physics answer has Open Interactive Lab button');
assert(document.querySelector('#workbench-lab-view .domain-widget[data-type="physics"]'), 'Auto-mounted Physics Free-Body Lab in workbench');
assert(document.querySelector('#chatheadpill').textContent.includes('Free-Body Vector & Slider Lab'), 'Chathead pill auto-updated to Free-Body Vector & Slider Lab');

// Ask a chem question
promptInput.value = 'Explain the SN2 nucleophilic attack and Walden inversion mechanism on 2-bromobutane';
composer.dispatchEvent(new window.Event('submit', { bubbles: true }));

messages = document.querySelectorAll('#messages .answer');
lastAnswer = messages[messages.length - 1];
assert(!lastAnswer.querySelector('.domain-widget'), 'Chemistry answer has no inline widget clutter');
assert(lastAnswer.querySelector('[data-open-lab="chem"]'), 'Chemistry answer has Open Interactive Lab button');
assert(document.querySelector('#workbench-lab-view .domain-widget[data-type="chem"]'), 'Auto-mounted Chem 2D Molecule Explorer in workbench');
assert(document.querySelector('#chatheadpill').textContent.includes('2D Molecule & Mechanism Viewer'), 'Chathead pill auto-updated to 2D Molecule & Mechanism Viewer');

console.log('\n--- 9. Testing Bento Workbench Floating Islands & Dual-Deck Stack ---');
// Verify layout elements
assert(document.querySelector('.left'), 'Left navigation element exists');
assert(document.querySelector('.center'), 'Center floating island element exists');
assert(document.querySelector('.right'), 'Right bento stack exists');
assert(document.querySelector('.workbench-card'), 'Top floating card (.workbench-card) exists');
assert(document.querySelector('.notes-dock-card'), 'Bottom floating card (.notes-dock-card) exists');

// Verify workbench tabs switching
const citationTab = document.querySelector('#citationtab');
const labTab = document.querySelector('#labtab');
const labView = document.querySelector('#workbench-lab-view');
const passageView = document.querySelector('#workbench-passage-view');

citationTab.click();
assert(citationTab.classList.contains('selected'), 'Clicking Source Passage tab selects it');
assert(!labTab.classList.contains('selected'), 'Interactive Lab tab unselected');
assert(passageView.style.display === 'block', 'Source Passage view is displayed');
assert(labView.style.display === 'none', 'Interactive Lab view is hidden');

// Test inline citation pill switches to passage tab
const citePill = document.querySelector('[data-cite="1"]');
assert(citePill, 'Inline citation pill [data-cite="1"] exists');
labTab.click(); // switch to lab first
assert(labTab.classList.contains('selected'), 'Switched back to lab');
citePill.click();
assert(citationTab.classList.contains('selected'), 'Clicking [data-cite] switches top workbench card to Source Passage');

// Test Open Interactive Lab button switches back to lab tab
const openLabChem = document.querySelector('[data-open-lab="chem"]');
openLabChem.click();
assert(labTab.classList.contains('selected'), 'Clicking Open Interactive Lab switches top card to Interactive Lab');
assert(document.querySelector('#workbench-lab-view .domain-widget[data-type="chem"]'), 'Chem widget active in workbench lab');

// Test Bottom Notes Dock Card Permanently Visible & Functional
const dockNotes = document.querySelectorAll('#docknoteslist .notecard');
assert(dockNotes.length > 0, `Notes dock contains ${dockNotes.length} visible notes`);

// Test Quick Scratchpad
const scratchpadInput = document.querySelector('#quicknoteinput');
assert(scratchpadInput, 'Quick scratchpad input exists in notes dock');
scratchpadInput.value = 'Important exam formula: a = g*(sin(theta) - mu*cos(theta))';
const enterEvent = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
scratchpadInput.dispatchEvent(enterEvent);

const updatedDockNotes = document.querySelectorAll('#docknoteslist .notecard');
assert(updatedDockNotes.length === dockNotes.length + 1, 'Quick scratchpad saves new note to dock list');
assert(updatedDockNotes[0].textContent.includes('Important exam formula'), 'New note is immediately displayed at the top of notes dock');

console.log('\n======================================================');
console.log('ALL VERIFICATION SUITES PASSED (100%) - BENTO SUCCESS!');
console.log('======================================================\n');
