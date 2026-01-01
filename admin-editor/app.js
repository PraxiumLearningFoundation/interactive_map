// Simple admin JSON editor for the Praxium organizations file
let organizationsData = [];

const jsonText = document.getElementById('json-text');
const fileInput = document.getElementById('file-input');
const orgList = document.getElementById('org-list');
const template = document.getElementById('org-template');
let CANONICAL_CATEGORIES = [];

function escapeHtml(str){
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function renderList(){
  orgList.innerHTML = '';
  organizationsData.forEach(org => {
    const node = template.content.cloneNode(true);
    const card = node.querySelector('.org-card');
    const nameDisplay = node.querySelector('.org-name-display');
    const editBtn = node.querySelector('.edit-btn');
    const deleteBtn = node.querySelector('.delete-btn');
    const form = node.querySelector('.org-form');

    nameDisplay.textContent = org.name || 'Unnamed';

    // populate form fields
    form.elements.name.value = org.name || '';
    form.elements.location.value = org.location || '';
    form.elements.lat.value = (org.coordinates && org.coordinates[0]) ? org.coordinates[0] : (org.lat || '');
    form.elements.lng.value = (org.coordinates && org.coordinates[1]) ? org.coordinates[1] : (org.lng || '');
    form.elements.description.value = org.description || '';
    form.elements.website.value = (org.contact && org.contact.website) ? org.contact.website : '';
    form.elements.connections.value = (org.connections && org.connections.length) ? org.connections.join(',') : '';

    // category select + custom handling — populate options from canonical list
    const sel = form.elements['category'];
    const custom = form.elements['category-custom'];
    if (sel) {
      // clear existing
      sel.innerHTML = '';
      const addOpt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t || v; sel.appendChild(o); };
      addOpt('', '-- Select category --');
      if (Array.isArray(CANONICAL_CATEGORIES) && CANONICAL_CATEGORIES.length) {
        CANONICAL_CATEGORIES.forEach(c => addOpt(c, c));
      }
      addOpt('Other','Other');
      addOpt('custom','Custom...');

      // try to match existing category (case-insensitive against canonical)
      const orgCat = (org.category||'').toString().trim();
      let matched = false;
      if (orgCat !== ''){
        // exact match first
        for (let i=0;i<sel.options.length;i++){
          if (sel.options[i].value === orgCat){ sel.value = sel.options[i].value; matched = true; break; }
        }
        if (!matched && Array.isArray(CANONICAL_CATEGORIES)){
          const found = CANONICAL_CATEGORIES.find(c => c.toLowerCase() === orgCat.toLowerCase());
          if (found){ sel.value = found; matched = true; }
        }
        if (!matched){ sel.value = 'custom'; custom.classList.remove('hidden'); custom.value = orgCat; }
        else { custom.classList.add('hidden'); custom.value = ''; }
      } else {
        custom.classList.add('hidden'); custom.value = '';
      }
    }

    editBtn.addEventListener('click', () => {
      form.classList.toggle('hidden');
    });

    deleteBtn.addEventListener('click', () => {
      if (!confirm('Delete this organization?')) return;
      organizationsData = organizationsData.filter(o => o.id !== org.id);
      syncToTextarea();
      renderList();
    });

    // show/hide custom input on select change
    if (sel){
      sel.onchange = () => {
        if (sel.value === 'custom') custom.classList.remove('hidden');
        else { custom.classList.add('hidden'); custom.value = ''; }
      };
    }

    form.onsubmit = (e) => {
      e.preventDefault();
      const selected = form.elements['category'];
      const customVal = form.elements['category-custom'] ? form.elements['category-custom'].value.trim() : '';
      let categoryValue = '';
      if (selected){
        if (selected.value === 'custom') categoryValue = customVal;
        else categoryValue = selected.value;
      } else {
        categoryValue = customVal;
      }

      const updated = {
        id: org.id,
        name: form.elements.name.value.trim(),
        location: form.elements.location.value.trim(),
        coordinates: [ Number(form.elements.lat.value) || 0, Number(form.elements.lng.value) || 0 ],
        category: categoryValue,
        description: form.elements.description.value.trim(),
        contact: { website: form.elements.website.value.trim() },
        connections: form.elements.connections.value.split(',').map(s=>Number(s.trim())).filter(Boolean)
      };

      const idx = organizationsData.findIndex(o=>o.id===org.id);
      if (idx > -1) organizationsData[idx] = updated;
      syncToTextarea();
      renderList();
    };

    orgList.appendChild(node);
  });
}

function syncToTextarea(){
  jsonText.value = JSON.stringify(organizationsData, null, 2);
}

function parseTextarea(){
  try{
    const parsed = JSON.parse(jsonText.value);
    if (!Array.isArray(parsed)) throw new Error('Top-level JSON must be an array of organizations');
    organizationsData = parsed.map((o,i)=>{
      let id = (o.id !== undefined && o.id !== null && o.id !== '') ? Number(o.id) : (i+1);
      if (Number.isNaN(id)) id = i+1;
      let rawCat = (o.category || o.type || '').toString().trim();
      // normalize to canonical if possible (case-insensitive match)
      if (Array.isArray(CANONICAL_CATEGORIES) && CANONICAL_CATEGORIES.length){
        const found = CANONICAL_CATEGORIES.find(c=>c.toLowerCase()===rawCat.toLowerCase());
        if (found) rawCat = found;
      }
      const category = rawCat;
      return { ...o, id, category };
    });
    renderList();
    alert('JSON parsed successfully. Preview updated on the right.');
  }catch(err){
    alert('Error parsing JSON: ' + err.message);
  }
}

// wire up controls
document.getElementById('parse-json').addEventListener('click', parseTextarea);
document.getElementById('reset-data').addEventListener('click', ()=>{
  if (!confirm('Reset current editor data?')) return;
  organizationsData = [];
  syncToTextarea(); renderList();
});

document.getElementById('add-new').addEventListener('click', ()=>{
  const newId = organizationsData.length ? Math.max(...organizationsData.map(o=>o.id))+1 : 1;
  const newOrg = { id: newId, name: 'New Organization', location: '', coordinates: [0,0], category: '', description: '', contact: { website: '' }, connections: [] };
  organizationsData.push(newOrg); syncToTextarea(); renderList();
});

document.getElementById('copy-json').addEventListener('click', async ()=>{
  try{ await navigator.clipboard.writeText(jsonText.value); alert('JSON copied to clipboard.'); }
  catch(err){ alert('Copy failed: ' + err.message); }
});

document.getElementById('download-json').addEventListener('click', ()=>{
  const blob = new Blob([jsonText.value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'organization-network-map.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});

// Load file input
fileInput.addEventListener('change', (e)=>{
  const f = e.target.files[0]; if (!f) return; const reader = new FileReader(); reader.onload = ()=>{ jsonText.value = reader.result; parseTextarea(); }; reader.readAsText(f);
});

// Load sample file relative to this folder (works if served or opened locally)
document.getElementById('load-sample').addEventListener('click', async ()=>{
  try{ const resp = await fetch('../organization-network-map.json'); if (!resp.ok) throw new Error('Not found'); const txt = await resp.text(); jsonText.value = txt; parseTextarea(); }
  catch(err){ alert('Could not load sample automatically. Instead, paste JSON or use the file input.'); }
});

// Paste JSON helper
document.getElementById('paste-json').addEventListener('click', async ()=>{
  try{ const text = await navigator.clipboard.readText(); if (!text) return alert('Clipboard empty. Copy your JSON then click Paste JSON.'); jsonText.value = text; parseTextarea(); }
  catch(err){ alert('Paste failed: ' + err.message + '\nAlternatively paste into the textarea manually.'); }
});

// Initialize with existing local file if available
(async function init(){
  try{
    // Use global legacy list if present (works with file://)
      if (window && Array.isArray(window.CANONICAL_CATEGORIES)) {
        CANONICAL_CATEGORIES = window.CANONICAL_CATEGORIES.slice();
      } else {
        try{
          const mod = await import('../categories.js');
          CANONICAL_CATEGORIES = mod && (mod.default || mod.CATEGORIES) ? (mod.default || mod.CATEGORIES) : [];
        }catch(err){
          try{
            const r = await fetch('../categories.json');
            if (r.ok) CANONICAL_CATEGORIES = await r.json();
          }catch(e){ /* ignore */ }
        }
    }

    const resp = await fetch('../organization-network-map.json');
    if (resp.ok){ const txt = await resp.text(); jsonText.value = txt; parseTextarea(); }
  }catch(e){}
})();
