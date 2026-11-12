'use strict';

const $ = id => document.getElementById(id);
const people = ILIS_CHARACTERS.map(character => character.name);
const objects = ['Chariot', 'Sac de sport', 'Mallette', 'Boîte d’archives', 'Drap de cérémonie', 'Valise'];
const places = ['Amphi A', 'Amphi B', 'LEXIM', 'Info 2', 'Cafétéria étudiante', 'RU L’Épi'];
const choices = [people, objects, places];
const storageKey = 'ilis-3d-v1';
const movement = {
  forward: [0, 1],
  back: [0, -1],
  left: [-1, 0],
  right: [1, 0]
};
const keyboardMoves = {
  KeyW: 'forward', KeyZ: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyQ: 'left', KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right'
};
const heldKeys = new Set();
const heldPointers = new Map();

let scene;
let T;
let campus;
let rig;
let look;
let ray;
let eye;
let forward;
let motion;
let viewPoint;
let level = 0;
let started = false;
let vrPanel = null;
let dragLook;
let lastHudAt = 0;
let nextTurnAt = 0;
let tipText = 'Entre dans l’accueil pour commencer l’enquête.';
let game = loadSave();
let turnHeld = 0;

function newCase() {
  const solution = choices.map(group => Math.floor(Math.random() * group.length));
  const clues = choices.flatMap((group, k) =>
    group.flatMap((_, i) => i === solution[k] ? [] : [{ k, i }])
  );
  for (let i = clues.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [clues[i], clues[j]] = [clues[j], clues[i]];
  }
  return { version: 1, solution, clues, found: [], attempts: 0, won: false };
}

function loadSave() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey));
    const valid = data?.version === 1 && data.solution?.length === choices.length
      && data.solution.every((i, k) => Number.isInteger(i) && choices[k][i] !== undefined)
      && data.clues?.length === 16
      && data.clues.every(c => Number.isInteger(c.k) && Number.isInteger(c.i)
        && choices[c.k]?.[c.i] !== undefined && c.i !== data.solution[c.k])
      && new Set(data.clues.map(c => c.k + ':' + c.i)).size === 16
      && Array.isArray(data.found) && data.found.every(i => Number.isInteger(i) && data.clues[i]);
    if (valid) return data;
  } catch {
    // Une sauvegarde indisponible laisse jouer dans la session en cours.
  }
  return newCase();
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(game));
  } catch {
    // L’enquête reste active en mémoire.
  }
}

function describeClue({ k, i }) {
  if (k === 0) return people[i] + ' dispose d’un alibi vérifié.';
  if (k === 1) return 'L’objet « ' + objects[i] + ' » est resté dans son rangement.';
  return 'Le trophée ne se trouve pas dans « ' + places[i] + ' ».';
}

function discover(index) {
  if (!game.found.includes(index)) {
    game.found.push(index);
    save();
    campus.markFound(index);
  }
  setTip('Indice ' + (index + 1) + ' ajouté au carnet.');
  showPanel('Indice ' + (index + 1), describeClue(game.clues[index]));
}

const dialogue = [
  'Les salles de cours ont été utilisées pour préparer la cérémonie. Regarde les documents laissés sur les tables.',
  'Dans les salles informatiques, tu trouveras des informations qui pourront écarter des pistes.',
  'Vérifie les amphithéâtres et les salles attenantes. Il y a des indices à plusieurs niveaux.',
  'Compare les témoignages avec ton carnet avant de choisir une personne, un objet et un lieu.',
  'La cafétéria et l’administration se trouvent au dernier étage. L’escalier est du côté des amphis C et D.',
  'Un indice peut t’aider même s’il ne concerne pas cette salle. Garde une trace dans ton carnet.',
  'La cérémonie va commencer. Vérifie le premier dossier ici à l’accueil, puis explore les salles et le parvis.'
];

function talk(index) {
  const character = ILIS_CHARACTERS[index];
  showPanel(character.name, dialogue[index], [], { portrait: portraitUrl(character) });
}

function openBook() {
  const excluded = choices.map(() => new Set());
  game.found.forEach(i => {
    const clue = game.clues[i];
    excluded[clue.k].add(clue.i);
  });
  const remaining = choices.map((group, k) => group.filter((_, i) => !excluded[k].has(i)));
  const summary = remaining.map(group => group.length);
  const buttons = [{ label: 'Accuser', run: () => accuse() }];
  if (scene.is('vr-mode')) {
    ['Personnes', 'Objets', 'Lieux'].forEach((label, k) => {
      buttons.unshift({
        label,
        run: () => showPanel(label, remaining[k].join(' · '), [
          { label: 'Retour au carnet', run: openBook }
        ])
      });
    });
  }
  showPanel('Carnet · ' + game.found.length + '/16 indices',
    summary[0] + ' personnes, ' + summary[1] + ' objets et ' + summary[2] + ' lieux restent possibles.',
    buttons,
    { clues: game.found.map(i => describeClue(game.clues[i])), remaining }
  );
}

function accuse(step = 0, picks = []) {
  if (game.won) {
    showPanel('Affaire résolue', conclusion());
    return;
  }
  const titles = ['Qui a déplacé le trophée ?', 'Quel objet a été utilisé ?', 'Où est caché le trophée ?'];
  showPanel(titles[step], 'Choisis une réponse.', choices[step].map((label, index) => ({
    label,
    run() {
      const answer = [...picks, index];
      if (step < 2) {
        accuse(step + 1, answer);
        return;
      }
      game.attempts++;
      game.won = answer.every((value, k) => value === game.solution[k]);
      save();
      showPanel(game.won ? 'Trophée retrouvé' : 'Enquête à poursuivre',
        game.won ? conclusion() : 'Cette combinaison ne correspond pas aux indices recueillis.',
        game.won ? [] : [{ label: 'Revoir le carnet', run: openBook }]
      );
    }
  })));
}

function conclusion() {
  const [person, object, place] = game.solution;
  return people[person] + ' a utilisé « ' + objects[object] + ' » pour déplacer le trophée vers « '
    + places[place] + ' » et préparer une surprise pour la cérémonie.';
}

function help() {
  showPanel('Commandes et plan',
    'iPad : maintiens une flèche pour marcher, glisse sur le décor pour regarder et touche un indice pour le lire. Ordinateur : ZQSD ou WASD, glisser pour regarder, E pour agir. Quest : sticks, gâchette et poignées.',
    [
      { label: 'Carnet', run: openBook },
      {
        label: 'Retour à l’entrée',
        run() { changeFloor(0); }
      },
      {
        label: 'Nouvelle enquête',
        run() {
          showPanel('Recommencer ?', 'Cette action remplace la progression de l’enquête.', [{
            label: 'Recommencer',
            run() {
              game = newCase();
              save();
              changeFloor(0);
            }
          }]);
        }
      }
    ],
    { showSources: true }
  );
}

function setTip(text) {
  tipText = text;
  $('tip').textContent = text;
}

function closePanel() {
  if ($('modal').open) $('modal').close();
  if (vrPanel) {
    scene.object3D.remove(vrPanel);
    vrPanel.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      mesh.material.map.dispose();
      mesh.material.dispose();
    });
    vrPanel = null;
  }
}

function showPanel(title, text, buttons = [], extra = {}) {
  clearMovement();
  closePanel();
  const options = [...buttons, { label: 'Fermer', run: closePanel }];
  if (scene.is('vr-mode')) {
    showVRPanel(title, text, options);
    return;
  }
  const modal = $('modal');
  const heading = document.createElement('h2');
  heading.id = 'panel-title';
  heading.textContent = title;
  const description = document.createElement('p');
  description.textContent = text;
  modal.replaceChildren(heading);
  if (extra.portrait) {
    const portrait = document.createElement('img');
    portrait.src = extra.portrait;
    portrait.alt = 'Portrait de ' + title;
    portrait.className = 'character-portrait';
    modal.append(portrait);
  }
  modal.append(description);
  if (extra.remaining) {
    const possibilities = document.createElement('details');
    const heading = document.createElement('summary');
    heading.textContent = 'Voir les pistes restantes';
    possibilities.append(heading);
    extra.remaining.forEach((group, i) => {
      const line = document.createElement('p');
      line.textContent = ['Personnes', 'Objets', 'Lieux'][i] + ' · ' + group.join(', ');
      possibilities.append(line);
    });
    modal.append(possibilities);
  }
  for (const text of extra.clues || []) {
    const entry = document.createElement('div');
    entry.className = 'clue';
    entry.textContent = text;
    modal.append(entry);
  }
  if (extra.showSources) appendSourceLinks(modal);
  const bar = document.createElement('div');
  bar.className = 'dialog-actions';
  for (const item of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.addEventListener('click', item.run);
    bar.append(button);
  }
  modal.append(bar);
  modal.showModal();
}

function appendSourceLinks(modal) {
  const sources = [
    ['Plan par étage', 'cartographie.html'],
    ['Façade et accès · Université de Lille', 'https://ufr3s.univ-lille.fr/ilis/plans-et-contacts'],
    ['Décor du LEXIM', 'https://ufr3s.univ-lille.fr/ilis/presentation/lexim'],
    ['Portrait d’Audrey Hayet · vidéo du forum', 'https://youtu.be/FOe-IN9WoUA']
  ];
  const list = document.createElement('ul');
  for (const [title, url] of sources) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = title;
    item.append(link);
    list.append(item);
  }
  modal.append(list);
}

function wrapText(text, limit) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > limit) {
      lines.push(line);
      line = word;
    } else {
      line += (line ? ' ' : '') + word;
    }
  }
  lines.push(line);
  return lines;
}

function showVRPanel(title, text, options) {
  const view = scene.camera;
  view.getWorldPosition(eye);
  view.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
  forward.normalize();
  vrPanel = new T.Group();
  vrPanel.position.copy(eye).addScaledVector(forward, 1.90);
  vrPanel.rotation.y = Math.atan2(-forward.x, -forward.z);
  scene.object3D.add(vrPanel);

  const label = (lines, x, y, width, height, background, action) => {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = Math.round(canvas.width * height / width);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff9eb';
    ctx.font = Math.min(52, canvas.height / (lines.length + 0.6)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      ctx.fillText(line, canvas.width / 2, (i + 0.5) * canvas.height / lines.length, canvas.width - 28);
    });
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    const mesh = new T.Mesh(new T.PlaneGeometry(width, height), new T.MeshBasicMaterial({
      map: texture, side: T.DoubleSide, toneMapped: false
    }));
    mesh.position.set(x, y, 0);
    mesh.userData.action = action;
    vrPanel.add(mesh);
  };

  label([title, ...wrapText(text, 55)], 0, 0.36, 2.84, 0.92, '#162d47');
  options.forEach((item, i) => {
    const x = i % 2 === 0 ? -0.72 : 0.72;
    label([item.label], x, -0.26 - Math.floor(i / 2) * 0.26, 1.35, 0.21, '#305b7b', item.run);
  });
  vrPanel.updateMatrixWorld(true);
}

function clearMovement() {
  turnHeld=0;
  heldKeys.clear();
  heldPointers.clear();
  dragLook = null;
  document.querySelectorAll('[data-move].pressed').forEach(button => button.classList.remove('pressed'));
}

function changeFloor(destination, landing = { x: 0, z: 6.8 }) {
  closePanel();
  clearMovement();
  level = destination;
  campus.build(level);
  rig.object3D.position.set(landing.x, 0, landing.z);
  if (!scene.is('vr-mode')) {
    rig.object3D.rotation.y = 0;
    look.yawObject.rotation.y = 0;
    look.pitchObject.rotation.x = 0;
    look.updateOrientation();
  }
  setTip(destination === 0 ? 'Commence à l’accueil, à gauche du couloir.' : ILIS_LEVELS[level].hall);
  updateHud();
}

function moveBy(side, advance, distance) {
  if (!started || vrPanel || $('modal').open || (!side && !advance)) return;
  scene.camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
  forward.normalize();
  motion.set(forward.x * advance - forward.z * side, 0, forward.z * advance + forward.x * side);
  if (motion.lengthSq() > 1) motion.normalize();
  motion.multiplyScalar(distance);
  const position = rig.object3D.position;
  const steps = Math.max(1, Math.ceil(motion.length() / 0.085));
  const dx = motion.x / steps;
  const dz = motion.z / steps;
  for (let i = 0; i < steps; i++) {
    if (campus.isWalkable(position.x + dx, position.z)) position.x += dx;
    if (campus.isWalkable(position.x, position.z + dz)) position.z += dz;
  }
}

function updateHud() {
  const position = rig.object3D.position;
  $('level').textContent = ILIS_LEVELS[level].short;
  const name = campus.placeName(position.x, position.z);
  $('room').textContent = level === 0 && name === 'Couloir' && position.z > 3 ? 'Hall d’entrée' : name;
  $('count').textContent = game.found.length + '/16';
  drawMap($('minimap'));
  if (!scene.is('vr-mode')) {
    ray.setFromCamera(viewPoint.set(0, 0), scene.camera);
    const inlineTarget = campus.aim(ray);
    $('dot').classList.toggle('ready', Boolean(inlineTarget));
    const prompt = inlineTarget?.userData.title || tipText;
    if ($('tip').textContent !== prompt) $('tip').textContent = prompt;
  }
}

function frame(time, delta) {
  if (!started || !campus) return;
  const pressed = new Set(Array.from(heldKeys, key => keyboardMoves[key]));
  heldPointers.forEach(item => pressed.add(item.direction));
  let side = Number(pressed.has('right')) - Number(pressed.has('left'));
  let advance = Number(pressed.has('forward')) - Number(pressed.has('back'));
  const session = scene.renderer.xr.getSession();
  if (session && !vrPanel) {
    for (const source of session.inputSources) {
      const axes = source.gamepad?.axes || [];
      const stickX = axes[2] ?? axes[0] ?? 0;
      const stickY = axes[3] ?? axes[1] ?? 0;
      if (source.handedness === 'left') {
        if (Math.abs(stickX) > 0.14) side += stickX;
        if (Math.abs(stickY) > 0.14) advance -= stickY;
      } else if (source.handedness === 'right' && Math.abs(stickX) > 0.65 && time >= nextTurnAt) {
        rig.object3D.rotation.y -= Math.sign(stickX) * Math.PI / 6;
        nextTurnAt = time + 330;
      }
    }
  }
  if(turnHeld && !$('modal').open && !vrPanel) {
    look.yawObject.rotation.y += turnHeld*Math.min(delta||0,50)*.0018;
    look.updateOrientation();
  }
  moveBy(side, advance, 2.85 * Math.min(delta || 0, 50) / 1000);
  const ground=campus.groundHeight(rig.object3D.position.x,rig.object3D.position.z);
  rig.object3D.position.y += (ground-rig.object3D.position.y)*Math.min(1,(delta||16)/100);
  scene.camera.getWorldPosition(eye);
  campus.animate(eye);
  if (time - lastHudAt >= 100) {
    lastHudAt = time;
    updateHud();
  }
}

function actionFromRay() {
  if (!started) return;
  if (vrPanel) {
    ray.intersectObjects(vrPanel.children)[0]?.object.userData.action?.();
  } else if (!$('modal').open) {
    const target = campus.aim(ray);
    if (target) target.userData.action();
  }
}

function interactAt(x = 0, y = 0) {
  if (!started) return;
  ray.setFromCamera(viewPoint.set(x, y), scene.camera);
  actionFromRay();
}

function capturePointer(element, event) {
  try { element.setPointerCapture(event.pointerId); } catch {}
}

function startDirection(button, event) {
  if (!started || $('modal').open || event.button > 0) return;
  event.preventDefault();
  const direction = button.dataset.move;
  heldPointers.set(event.pointerId, { direction, button });
  capturePointer(button, event);
  button.classList.add('pressed');
  // Un appui bref se traduit également par un pas.
  moveBy(...movement[direction], 0.27);
  updateHud();
}

function stopDirection(event) {
  const item = heldPointers.get(event.pointerId);
  if (!item) return;
  heldPointers.delete(event.pointerId);
  if (![...heldPointers.values()].some(other => other.button === item.button)) {
    item.button.classList.remove('pressed');
  }
}

function bindControls(canvas) {
  for (const button of document.querySelectorAll('[data-move]')) {
    button.addEventListener('pointerdown', event => startDirection(button, event));
    button.addEventListener('lostpointercapture', stopDirection);
    button.addEventListener('click', event => {
      if (event.detail === 0) {
        moveBy(...movement[button.dataset.move], 0.4);
        updateHud();
      }
    });
  }
  window.addEventListener('pointerup', stopDirection);
  window.addEventListener('pointercancel', stopDirection);
  window.addEventListener('blur', clearMovement);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearMovement();
  });

  canvas.addEventListener('pointerdown', event => {
    if (!started || $('modal').open || scene.is('vr-mode') || dragLook || event.button > 0) return;
    event.preventDefault();
    capturePointer(canvas, event);
    dragLook = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 };
  });
  canvas.addEventListener('pointermove', event => {
    if (!dragLook || dragLook.id !== event.pointerId) return;
    const dx = event.clientX - dragLook.x;
    const dy = event.clientY - dragLook.y;
    dragLook.x = event.clientX;
    dragLook.y = event.clientY;
    dragLook.distance += Math.hypot(dx, dy);
    if (dragLook.distance < 5) return;
    look.yawObject.rotation.y -= dx * 0.0045;
    look.pitchObject.rotation.x = T.MathUtils.clamp(look.pitchObject.rotation.x - dy * 0.0045, -1.29, 1.29);
    look.updateOrientation();
  });
  canvas.addEventListener('pointerup', event => {
    if (!dragLook || dragLook.id !== event.pointerId) return;
    const tap = dragLook.distance < 7;
    dragLook = null;
    if (tap) {
      const rect = canvas.getBoundingClientRect();
      interactAt((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    }
  });
  for (const name of ['pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(name, event => {
      if (dragLook?.id === event.pointerId) dragLook = null;
    });
  }

  window.addEventListener('keydown', event => {
    if (!started || $('modal').open) return;
    if (keyboardMoves[event.code]) {
      event.preventDefault();
      heldKeys.add(event.code);
    }
    if (event.code === 'KeyE' && !event.repeat) interactAt();
  });
  window.addEventListener('keyup', event => heldKeys.delete(event.code));
  $('mapbtn').addEventListener('click',openMap);
  for(const [id,dir] of [['turnleft',1],['turnright',-1]]) {
    const b=$(id);
    b.addEventListener('pointerdown',e=>{e.preventDefault();capturePointer(b,e);turnHeld=dir;});
    for(const event of ['pointerup','pointercancel','lostpointercapture']) b.addEventListener(event,()=>turnHeld=0);
  }
  $('use').addEventListener('click', () => interactAt());
  $('book').addEventListener('click', openBook);
  $('accuse').addEventListener('click', () => accuse());
  $('help').addEventListener('click', help);
}

function drawMap(canvas,large=false) {
  if(!canvas || !campus) return;
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  const data=campus.mapData();
  const bounds={left:-15,right:39,top:-46,bottom:level===0?31:11};
  const scale=Math.min((w-24)/(bounds.right-bounds.left),(h-36)/(bounds.bottom-bounds.top));
  const x=v=>12+(v-bounds.left)*scale, z=v=>27+(v-bounds.top)*scale;
  ctx.fillStyle='#102437ed';ctx.fillRect(0,0,w,h);
  ctx.font=(large?'16':'12')+'px system-ui';ctx.fillStyle='#f1d29d';ctx.fillText(ILIS_LEVELS[level].short+' · PLAN',12,18);
  for(const f of data.floors){
    ctx.fillStyle=f.name==='Parvis et abords'?'#304849':'#7a8a8d';
    ctx.fillRect(x(f.x-f.w/2),z(f.z-f.d/2),f.w*scale,f.d*scale);
  }
  for(const r of data.rooms){
    const rx=x(r.x-r.w/2),rz=z(r.z-r.d/2);
    ctx.fillStyle=r.type==='amphi'?'#8f7155':'#456777';
    ctx.fillRect(rx,rz,r.w*scale,r.d*scale);
    ctx.strokeStyle='#b5c5c8';ctx.lineWidth=.7;ctx.strokeRect(rx,rz,r.w*scale,r.d*scale);
    if(r.index!==null && r.index!==undefined){
      ctx.fillStyle=game.found.includes(r.index)?'#77dbb0':'#ffcc72';
      ctx.beginPath();ctx.arc(x(r.x),z(r.z),large?5:3,0,Math.PI*2);ctx.fill();
    }
    if(large){ctx.fillStyle='#fff';ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillText(r.name,x(r.x),z(r.z)+16,r.w*scale-4);ctx.textAlign='left';}
  }
  for(const stair of data.stairMarkers){ctx.fillStyle='#a8d9ff';ctx.font=(large?'18':'13')+'px system-ui';ctx.textAlign='center';ctx.fillText('↕',x(stair.x),z(stair.z)+4);ctx.textAlign='left';}
  const p=rig.object3D.position;
  scene.camera.getWorldDirection(forward);
  ctx.save();ctx.translate(x(p.x),z(p.z));ctx.rotate(Math.atan2(forward.x,-forward.z));
  ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(5,5);ctx.lineTo(0,3);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.restore();
}
function openMap(){
  if(scene.is('vr-mode')){help();return;}
  showPanel('Plan · '+ILIS_LEVELS[level].title,'Flèche blanche : votre position. Points dorés : indices à trouver. Points verts : indices lus. Les flèches bleues indiquent les escaliers.');
  const canvas=document.createElement('canvas');canvas.width=540;canvas.height=680;canvas.className='large-map';
  $('modal').insertBefore(canvas,$('modal').querySelector('.dialog-actions'));drawMap(canvas,true);
}

function begin() {
  started = true;
  $('start').hidden = true;
  $('hud').hidden = scene.is('vr-mode');
  updateHud();
}

function init() {
  T = AFRAME.THREE;
  rig = $('rig');
  look = $('cam').components['look-controls'];
  ray = new T.Raycaster();
  eye = new T.Vector3();
  forward = new T.Vector3();
  motion = new T.Vector3();
  viewPoint = new T.Vector2();

  const sky = new T.HemisphereLight('#eaf5ff', '#aba28d', 1.55);
  const sun = new T.DirectionalLight('#fff1d6', 0.82);
  sun.position.set(8, 25, 18);
  scene.object3D.add(sky, sun);
  scene.object3D.fog = new T.Fog('#b5d5e6', 47, 126);
  if (matchMedia('(pointer: coarse)').matches && devicePixelRatio > 1.65) {
    scene.renderer.setPixelRatio(1.65);
    scene.resize();
  }

  campus = createCampus(T, scene.object3D, { discover, talk, changeFloor, found: i => game.found.includes(i) });
  changeFloor(0);
  bindControls(scene.canvas);

  $('play').disabled = false;
  $('play').textContent = 'Entrer dans l’ILIS';
  $('play').addEventListener('click', begin);
  $('vrstart').disabled = false;
  $('vrstart').addEventListener('click', async () => {
    if (!navigator.xr) {
      $('bootstatus').textContent = 'Le mode casque s’ouvre dans le navigateur du Quest. Tu peux explorer en 3D ici avec les flèches.';
      return;
    }
    try {
      await scene.enterVR();
    } catch {
      $('bootstatus').textContent = 'Le casque n’a pas démarré le mode VR. Réessaie depuis Meta Quest Browser.';
    }
  });
  scene.addEventListener('enter-vr', () => {
    closePanel();
    clearMovement();
    begin();
  });
  scene.addEventListener('exit-vr', () => {
    closePanel();
    clearMovement();
    $('hud').hidden = !started;
  });
  for (const id of ['left', 'right']) {
    const hand = $(id);
    hand.addEventListener('triggerdown', () => {
      if (!started) return;
      const origin = hand.object3D.getWorldPosition(new T.Vector3());
      const rotation = hand.object3D.getWorldQuaternion(new T.Quaternion());
      ray.set(origin, new T.Vector3(0, 0, -1).applyQuaternion(rotation));
      actionFromRay();
    });
    hand.addEventListener('gripdown', () => {
      if (!started) return;
      if (vrPanel) closePanel();
      else if (id === 'left') openBook();
      else accuse();
    });
  }
  scene.setAttribute('ilis-locomotion', '');
}

window.addEventListener('error', event => {
  if (!started && !$('bootstatus').textContent) $('bootstatus').textContent = event.message?.includes('WebGL')
    ? 'Ce navigateur ne parvient pas à démarrer WebGL. Ouvre le jeu dans Safari sur iPad ou Meta Quest Browser.'
    : 'Le chargement de la scène 3D a été interrompu. Recharge la page.';
});

if (window.AFRAME) {
  AFRAME.registerComponent('ilis-locomotion', { tick: frame });
  scene = $('scene');
  if (scene.hasLoaded) init();
  else scene.addEventListener('loaded', init, { once: true });
} else {
  $('bootstatus').textContent = 'Le moteur 3D n’a pas chargé. Vérifie la connexion, puis recharge la page.';
}
