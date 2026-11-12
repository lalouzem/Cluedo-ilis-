'use strict';

const ILIS_CHARACTERS = [
  { name: 'Daphné Salerno', portrait: 'salerno', jacket: '#627f64', skin: '#c99579', hair: '#635044', longHair: true },
  { name: 'Fabio Boudis', portrait: 'boudis', jacket: '#d2bf9f', skin: '#a17559', hair: '#382c27' },
  { name: 'Sébastien Gosselin', portrait: 'gosselin', jacket: '#324d6b', skin: '#c99476', hair: '#453630' },
  { name: 'Francisco Mananga', portrait: 'mananga', jacket: '#394758', skin: '#8e5e45', hair: '#382b26' },
  { name: 'Valentine Baert', portrait: 'baert', jacket: '#a0835f', skin: '#cc9b83', hair: '#876d4e', longHair: true },
  { name: 'Valérie Habracken', portrait: 'habracken', jacket: '#526d88', skin: '#ce9a80', hair: '#9f865b' },
  { name: 'Audrey Hayet', portrait: 'hayet', jacket: '#514957', skin: '#bf9679', hair: '#694035', longHair: true }
];

const ILIS_LEVELS = [
  { title: 'Rez-de-chaussée', short: 'RDC', accent: '#a9373f', hall: 'Accueil · Amphi A' },
  { title: 'Premier étage', short: '1er étage', accent: '#245686', hall: 'Salles de cours · Amphis B et C' },
  { title: 'Deuxième étage', short: '2e étage', accent: '#50467c', hall: 'LEXIM · Salles info · Amphis C et D' },
  { title: 'Troisième étage', short: '3e étage', accent: '#436654', hall: 'Cafétéria · Administration' }
];

function createCampus(T, sceneRoot, actions) {
  const width = 4.4;
  const ceiling = 3.22;
  const corridorEnd = -45;
  const facadeZ = 9;
  const floorGap = 3.45;
  const materialCache = new Map();
  const boxGeometry = new T.BoxGeometry();
  const roundGeometry = new T.SphereGeometry(1, 18, 14);
  const imageLoader = new T.TextureLoader();
  const compass = new T.Vector3();
  const sightRay = new T.Raycaster();
  let world;
  let level;
  let floors;
  let rooms;
  let colliders;
  let interactables;
  let blockers;
  let characters;
  let batches;
  let noteMeshes;

  function material(color) {
    if (typeof color !== 'string') return color;
    if (!materialCache.has(color)) {
      materialCache.set(color, new T.MeshStandardMaterial({ color, roughness: 0.78 }));
    }
    return materialCache.get(color);
  }

  function addBox(x, y, z, w, h, d, color, options = {}) {
    const { solid = false, sight = solid, parent = world, yaw = 0, action, title, dynamic = false } = options;
    const mesh = new T.Mesh(boxGeometry, material(color));
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.rotation.y = yaw;
    if (solid) colliders.push({ x, z, w, d });
    if (action || dynamic || parent !== world) {
      parent.add(mesh);
      if (action) makeAction(mesh, title, action);
      if (sight) blockers.push(mesh);
    } else {
      const key = mesh.material.uuid + ':' + sight;
      if (!batches.has(key)) batches.set(key, { material: mesh.material, meshes: [], sight });
      mesh.updateMatrix();
      batches.get(key).meshes.push(mesh.matrix);
    }
    return mesh;
  }

  function makeAction(mesh, title, action) {
    mesh.userData.action = action;
    mesh.userData.title = title;
    interactables.push(mesh);
  }

  function sphere(parent, color, position, scale) {
    const mesh = new T.Mesh(roundGeometry, material(color));
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    parent.add(mesh);
    return mesh;
  }

  function canvasTexture(w, h, paint) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    paint(canvas.getContext('2d'), w, h);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  const metal = '#536b7d';
  const dark = '#263b4d';
  const plaster = '#dbdedb';
  const white = '#eef2e9';
  const red = '#b83038';
  const oak = '#b4875f';
  const daylight = new T.MeshBasicMaterial({ color: '#fff9e8', toneMapped: false });
  const glass = new T.MeshStandardMaterial({
    color: '#6095b5', transparent: true, opacity: 0.36, roughness: 0.25, depthWrite: false
  });
  const skylineGlass = new T.MeshStandardMaterial({
    color: '#7095ae', roughness: 0.35, metalness: 0.21,
    map: canvasTexture(32, 128, (ctx, w, h) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, '#f2fbff');
      gradient.addColorStop(0.56, '#bacbd8');
      gradient.addColorStop(0.60, '#899cb0');
      gradient.addColorStop(1, '#546e80');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    })
  });

  function tiledMaterial(grout, colors) {
    const texture = canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = grout;
      ctx.fillRect(0, 0, w, h);
      const tileW = w / 4;
      const tileH = h / 8;
      for (let row = 0; row < 8; row++) {
        for (let column = -1; column < 4; column++) {
          ctx.fillStyle = colors[(column + 4 + row * 3) % colors.length];
          ctx.fillRect(column * tileW + (row % 2) * tileW / 2 + 1, row * tileH + 1, tileW - 2, tileH - 2);
        }
      }
      let seed = 1287;
      for (let i = 0; i < 8000; i++) {
        seed = (1664525 * seed + 1013904223) >>> 0;
        ctx.fillStyle = i % 2 ? '#1e2e4221' : '#fff7dd40';
        ctx.fillRect(seed % w, (seed >>> 9) % h, 1, 1);
      }
    });
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    return new T.MeshStandardMaterial({ map: texture, roughness: 0.9 });
  }

  const terrazzo = tiledMaterial('#718089', ['#bcc3c3', '#b4babc', '#c7cbca', '#aab3b8', '#c0c6c6']);
  const linoleum = tiledMaterial('#a29d8e', ['#d1c5aa', '#d2cbb9', '#c9c3b2']);
  const carpet = tiledMaterial('#2c3847', ['#42515d', '#3e4e61', '#495460']);
  const sidewalk = tiledMaterial('#989f9e', ['#adb5b5', '#bfc4c0', '#c6c8bc']);

  function floorSurface(x, z, w, d, surface, y = 0) {
    const geometry = new T.PlaneGeometry(w, d);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * w / 2.4 + x / 2.4, uv.getY(i) * d / 2.4 + z / 2.4);
    }
    const mesh = new T.Mesh(geometry, surface);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    world.add(mesh);
    return mesh;
  }

  function walkable(x, z, w, d, name = '') {
    floors.push({ x, z, w, d, name });
  }

  function plaque(text, x, y, z, w, h, options = {}) {
    const { color = '#244968', ink = '#fffdf3', yaw = 0, parent = world, action, title = text } = options;
    const texture = canvasTexture(768, Math.max(64, Math.round(768 * h / w)), (ctx, cw, ch) => {
      const lines = text.split('\n');
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '600 ' + Math.round(Math.min(78, ch / (lines.length + 0.75))) + 'px system-ui, sans-serif';
      lines.forEach((line, i) => {
        ctx.fillText(line, cw / 2, (i + 0.5) * ch / lines.length, cw - 34);
      });
    });
    const surface = new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide, toneMapped: false });
    const mesh = new T.Mesh(new T.PlaneGeometry(w, h), surface);
    mesh.userData.ownedMaterial = true;
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    parent.add(mesh);
    if (action) makeAction(mesh, title, action);
    return mesh;
  }

  function windowPanel(x, y, z, span, h, axis, isOutside = false) {
    const front = axis === 'x';
    const wide = front ? span : 0.045;
    const depth = front ? 0.045 : span;
    addBox(x, y, z, wide, h, depth, isOutside ? skylineGlass : glass, {
      solid: y - h / 2 < 1.9 && y + h / 2 > 0.1, sight: false
    });
    for (const side of [-1, 1]) {
      addBox(x + (front ? side * span / 2 : 0), y, z + (front ? 0 : side * span / 2),
        0.085, h + 0.08, 0.085, metal);
      addBox(x, y + side * h / 2, z, front ? span : 0.09, 0.07, front ? 0.09 : span, metal);
    }
    addBox(x, y - 0.24 * h, z, front ? span : 0.08, 0.045, front ? 0.08 : span, metal);
  }

  function wall(x, z, w, d, color = plaster, solid = true) {
    addBox(x, ceiling / 2, z, w, ceiling, d, color, { solid, sight: true });
  }

  function lightStrip(x, z, w = 1.2) {
    addBox(x, ceiling - 0.04, z, w, 0.058, 0.43, daylight);
  }

  function ceilingTiles(x, z, w, d) {
    addBox(x, ceiling + 0.07, z, w, 0.14, d, white);
    for (let dz = -d / 2 + 0.62; dz < d / 2; dz += 0.62) {
      addBox(x, ceiling - 0.004, z + dz, w, 0.009, 0.016, '#aab6b7');
    }
    for (let dx = -w / 2 + 0.62; dx < w / 2; dx += 0.62) {
      addBox(x + dx, ceiling - 0.004, z, 0.016, 0.009, d, '#aab6b7');
    }
  }

  function railing(x, y, z, length, axis = 'x', solid = false) {
    const alongX = axis === 'x';
    for (let i = 0; i <= Math.ceil(length / 0.31); i++) {
      const offset = length * i / Math.ceil(length / 0.31) - length / 2;
      addBox(x + (alongX ? offset : 0), y + 0.55, z + (alongX ? 0 : offset), 0.036, 1.1, 0.044, metal);
    }
    addBox(x, y + 1.10, z, alongX ? length : 0.09, 0.066, alongX ? 0.09 : length, dark);
    addBox(x, y + 0.16, z, alongX ? length : 0.05, 0.045, alongX ? 0.05 : length, metal);
    if (solid) colliders.push({ x, z, w: alongX ? length : 0.1, d: alongX ? 0.1 : length });
  }

  function planter(x, z, height = 1.25) {
    addBox(x, 0.22, z, 0.62, 0.44, 0.62, '#526876', { solid: true });
    addBox(x, 0.43 + height / 2, z, 0.055, height, 0.055, '#745644');
    for (const [dx, dz, dy] of [[0.15, 0, 0.05], [-0.17, 0.04, -0.13], [0, 0.12, 0.29]]) {
      sphere(world, dy > 0 ? '#61884b' : '#49734b', [x + dx, height + dy, z + dz], [0.31, 0.53, 0.28]);
    }
  }

  function table(x, z, w = 1.24, d = 0.62, color = oak, top = 0.73) {
    addBox(x, top - 0.025, z, w, 0.05, d, color, { solid: true });
    for (const dx of [-w / 2 + 0.08, w / 2 - 0.08]) {
      for (const dz of [-d / 2 + 0.07, d / 2 - 0.07]) {
        addBox(x + dx, top / 2, z + dz, 0.035, top, 0.035, dark);
      }
    }
  }

  function chair(x, z, color, base = 0) {
    addBox(x, base + 0.43, z, 0.47, 0.08, 0.46, color);
    addBox(x, base + 0.69, z + 0.21, 0.46, 0.48, 0.07, color);
    addBox(x - 0.17, base + 0.21, z, 0.033, 0.42, 0.36, metal);
    addBox(x + 0.17, base + 0.21, z, 0.033, 0.42, 0.36, metal);
  }

  function monitor(x, z, color = '#6cb3cf') {
    addBox(x, 0.99, z, 0.65, 0.41, 0.055, dark);
    addBox(x, 0.99, z + 0.03, 0.59, 0.34, 0.009, color);
    addBox(x, 0.80, z, 0.035, 0.13, 0.08, dark);
    addBox(x, 0.746, z + 0.22, 0.43, 0.022, 0.15, '#2e414c');
  }

  function putClue(index, x, z) {
    table(x, z, 1.05, 0.68);
    const title = 'Lire l’indice ' + (index + 1);
    const use = () => actions.discover(index);
    const folder = addBox(x, 0.758, z + 0.04, 0.49, 0.035, 0.31,
      actions.found(index) ? '#71a695' : '#e9b153', { action: use, title });
    addBox(x, 0.779, z + 0.045, 0.33, 0.006, 0.23, '#fff2d4', { action: use, title });
    const sign = plaque('INDICE ' + (index + 1), x, 1.16, z + 0.12, 0.85, 0.24, {
      color: actions.found(index) ? '#326552' : '#795118', action: use, title
    });
    sign.userData.facePlayer = true;
    noteMeshes.set(index, folder);
  }

  const faceTextures = ILIS_CHARACTERS.map(character => {
    const texture = canvasTexture(256, 320, (ctx, w, h) => {
      ctx.fillStyle = character.skin;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#423328';
      ctx.fillRect(76, 127, 22, 7);
      ctx.fillRect(156, 127, 22, 7);
      ctx.fillRect(110, 216, 38, 5);
    });
    const image = new Image();
    image.onload = () => {
      const canvas = texture.image;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.save();
      ctx.translate(128, 157);
      ctx.scale(125, 159);
      const mask = ctx.createRadialGradient(0, 0, 0.70, 0, 0, 1);
      mask.addColorStop(0, '#ffffff');
      mask.addColorStop(0.86, '#ffffff');
      mask.addColorStop(1, '#ffffff00');
      ctx.fillStyle = mask;
      ctx.fillRect(-1.1, -1.1, 2.2, 2.2);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      texture.needsUpdate = true;
    };
    image.src = portraitUrl(character);
    return texture;
  });

  function avatar(index, x, z) {
    const character = ILIS_CHARACTERS[index];
    const person = new T.Group();
    person.position.set(x, 0, z);
    world.add(person);
    characters.push(person);
    colliders.push({ x, z, w: 0.53, d: 0.42 });
    const use = () => actions.talk(index);
    const options = { parent: person, action: use, title: 'Parler à ' + character.name };
    for (const side of [-1, 1]) {
      addBox(side * 0.115, 0.47, 0, 0.18, 0.85, 0.23, '#343f52', options);
      addBox(side * 0.116, 0.07, 0.065, 0.19, 0.14, 0.34, '#252c37', options);
      const arm = sphere(person, character.jacket, [side * 0.29, 1.12, 0], [0.088, 0.30, 0.094]);
      arm.rotation.z = side * 0.09;
      const hand = sphere(person, character.skin, [side * 0.315, 0.83, 0.018], [0.058, 0.083, 0.056]);
      makeAction(arm, options.title, use);
      makeAction(hand, options.title, use);
    }
    const torso = sphere(person, character.jacket, [0, 1.12, 0], [0.269, 0.36, 0.146]);
    makeAction(torso, options.title, use);
    addBox(0, 1.32, 0.132, 0.115, 0.19, 0.025, '#ece6d8', options);
    addBox(0.09, 1.17, 0.139, 0.09, 0.059, 0.011, '#f0eee4', options);
    addBox(0, 1.46, 0, 0.124, 0.18, 0.117, character.skin, options);
    sphere(person, character.hair, [0, 1.66, -0.041], [0.164, 0.208, 0.13]);
    if (character.longHair) {
      for (const side of [-1, 1]) {
        sphere(person, character.hair, [side * 0.127, 1.53, -0.048], [0.065, 0.243, 0.079]);
      }
    }
    const head = sphere(person, character.skin, [0, 1.655, 0], [0.148, 0.206, 0.125]);
    makeAction(head, options.title, use);

    const geometry = new T.PlaneGeometry(0.309, 0.409, 14, 16);
    const vertices = geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const u = vertices.getX(i) / 0.156;
      const v = vertices.getY(i) / 0.206;
      vertices.setZ(i, 0.043 + 0.11 * Math.sqrt(Math.max(0, 1 - 0.72 * (u * u + v * v))));
    }
    geometry.computeVertexNormals();
    const face = new T.Mesh(geometry, new T.MeshBasicMaterial({
      map: faceTextures[index], alphaTest: 0.33, side: T.FrontSide, toneMapped: false
    }));
    face.userData.ownedMaterial = true;
    face.userData.keepMap = true;
    face.position.y = 1.657;
    person.add(face);
    makeAction(face, options.title, use);
    plaque(character.name, 0, 2.06, 0, 1.55, 0.23, {
      parent: person, action: use, title: options.title
    });
  }

  function door(doorX, z, direction, name) {
    const accent = ILIS_LEVELS[level].accent;
    addBox(doorX, 1.14, z - 0.94, 0.23, 2.28, 0.065, accent);
    addBox(doorX, 1.14, z + 0.94, 0.23, 2.28, 0.065, accent);
    addBox(doorX, 2.28, z, 0.23, 0.08, 1.96, accent);
    const doorYaw = direction < 0 ? Math.PI / 2 : -Math.PI / 2;
    plaque(name, doorX - direction * 0.126, 2.62, z, 2.05, 0.31, { color: accent, yaw: doorYaw });
    addBox(doorX + direction * 0.55, 1.11, z + 1.02, 0.18, 2.2, 0.86, '#687f93', { yaw: doorYaw });
    addBox(doorX + direction * 0.54, 1.63, z + 1.02, 0.186, 0.49, 0.33, skylineGlass, { yaw: doorYaw });
    addBox(doorX + direction * 0.52, 1.04, z + 0.76, 0.16, 0.055, 0.12, '#bbc6cc');
  }

  function seats(x, z, w, d, front) {
    const rows = d >= 10 ? 5 : 4;
    const shade = level % 2 ? '#386580' : '#305777';
    const chairsPerSide = w >= 10 ? 4 : 3;
    for (let row = 0; row < rows; row++) {
      const rz = front + 2.5 + row * 1.30;
      const rise = row * 0.115;
      addBox(x, (rise - 0.03) / 2, rz, w - 0.68, rise + 0.03, 1.27, '#485b69');
      addBox(x, rise + 0.014, rz - 0.62, w - 0.75, 0.027, 0.028, '#b9c1bc');
      for (const side of [-1, 1]) {
        for (let col = 0; col < chairsPerSide; col++) {
          chair(x + side * (0.93 + col * 0.70), rz, shade, rise);
        }
      }
    }
    addBox(x, 1.79, front + 0.16, w - 2.0, 1.65, 0.1, '#223544');
    plaque('ILIS · Université de Lille', x, 1.82, front + 0.22, w - 2.35, 1.2, {
      color: '#d5e4e5', ink: '#254960'
    });
    table(x - w / 2 + 1.15, front + 1.42, 1.0, 0.58, '#c5a47d');
  }

  const leximProjection = imageLoader.load('assets/lexim-projection.jpg');
  leximProjection.colorSpace = T.SRGBColorSpace;
  const screenMaterial = new T.MeshBasicMaterial({ map: leximProjection, toneMapped: false });

  function furnish(room, type) {
    const { x, z, w, d, name } = room;
    const front = z - d / 2;
    if (type === 'amphi') {
      seats(x, z, w, d, front);
      return;
    }
    if (type === 'lexim') {
      addBox(x, 1.7, front + 0.26, w - 0.8, 3.06, 0.16, '#243045');
      addBox(x, 1.73, front + 0.36, 4.6, 1.94, 0.028, screenMaterial);
      for (const side of [-1, 1]) {
        table(x + side * 2.55, z + 1.18, 1.18, 0.65, '#556471');
        monitor(x + side * 2.55, z + 1.08, '#538fbc');
        chair(x + side * 2.55, z + 1.85, '#655681');
        addBox(x + side * 2.5, 1.12, z + 1.16, 0.29, 0.16, 0.20, '#eee9e0');
      }
      return;
    }
    if (type === 'toilets') {
      addBox(x, 0.85, front + 0.65, w - 1.1, 0.18, 0.64, '#d6dede', { solid: true });
      addBox(x, 1.62, front + 0.16, w - 1.5, 0.90, 0.035, skylineGlass);
      for (const dx of [-1.6, 0, 1.6]) {
        addBox(x + dx, 0.95, front + 0.64, 0.56, 0.10, 0.40, white);
        addBox(x + dx, 1.06, front + 0.43, 0.036, 0.17, 0.036, metal);
      }
      return;
    }
    if (type === 'cafe') {
      addBox(x, 0.53, front + 0.72, w - 1.15, 1.06, 0.80, '#426e78', { solid: true });
      addBox(x, 1.09, front + 0.73, w - 1.02, 0.10, 0.90, '#d0b996');
      plaque('Cafétéria', x, 2.48, front + 0.18, 2.7, 0.37, { color: '#436654' });
      for (const dx of [-2.0, 2.0]) {
        for (const dz of [-0.2, 2.15]) {
          table(x + dx, z + dz, 1.55, 0.95, '#caac83');
          chair(x + dx - 0.45, z + dz + 0.73, dx < 0 ? '#a94449' : '#356f78');
          chair(x + dx + 0.45, z + dz + 0.73, dx < 0 ? '#a94449' : '#356f78');
        }
      }
      return;
    }
    if (type === 'office' || type === 'reception') {
      table(x - 0.78, z + 1.3, 2.6, 0.88, '#b8916d');
      monitor(x - 1.31, z + 1.22);
      chair(x - 1.31, z + 2.09, '#42667e');
      for (const dx of [-2.25, 2.25]) {
        addBox(x + dx, 1, front + 0.46, 1.13, 2, 0.58, '#728c99', { solid: true });
        addBox(x + dx, 0.82, front + 0.765, 0.025, 0.20, 0.029, '#d4e0e1');
      }
      plaque(name, x, 2.35, front + 0.185, 2.55, 0.36, { color: ILIS_LEVELS[level].accent });
      return;
    }
    if (type === 'meeting') {
      table(x, z + 0.35, 2.55, 1.05);
      for (const dx of [-0.82, 0, 0.82]) chair(x + dx, z + 1.12, '#3a7180');
      addBox(x, 1.84, front + 0.17, 3.0, 1.15, 0.07, '#2e4050');
      return;
    }
    const info = type === 'info';
    addBox(x, 1.77, front + 0.17, Math.min(w - 1, 4.9), 1.2, 0.065, '#e9efea');
    addBox(x, 1.14, front + 0.205, Math.min(w - 1, 4.9), 0.055, 0.083, metal);
    for (const dx of [-2.05, 2.05]) {
      for (const dz of [0, 1.95]) {
        table(x + dx, z + dz, 1.38, 0.64);
        chair(x + dx, z + dz + 0.62, info ? '#456893' : '#41808b');
        if (info) monitor(x + dx, z + dz - 0.06);
      }
    }
  }

  function room(name, wing, side, z, w, d, type, index, npc) {
    const inner = wing + side * width / 2;
    const x = inner + side * w / 2;
    const outer = inner + side * w;
    const volume = { name, wing, side, x, z, w, d };
    rooms.push(volume);
    walkable(x, z, w + 0.10, d, name);
    floorSurface(x, z, w, d, type === 'amphi' || type === 'lexim' ? carpet : linoleum);
    ceilingTiles(x, z, w, d);
    wall(x, z - d / 2, w, 0.16, white);
    wall(x, z + d / 2, w, 0.16, white);
    const end = (d - 1.88) / 2;
    for (const dz of [-1, 1]) wall(inner, z + dz * (0.94 + end / 2), 0.16, end);
    addBox(inner, 2.76, z, 0.16, 0.92, 1.88, plaster);
    if (['amphi', 'toilets', 'lexim'].includes(type)) {
      wall(outer, z, 0.17, d, type === 'lexim' ? '#514b68' : '#c6d0d0');
    } else {
      addBox(outer, 0.49, z, 0.17, 0.98, d, '#b4c3c7', { solid: true });
      addBox(outer, 2.82, z, 0.17, 0.80, d, '#aab9bf');
      const panes = Math.ceil(d / 1.85);
      for (let i = 0; i < panes; i++) {
        windowPanel(outer, 1.72, z - d / 2 + (i + 0.5) * d / panes, d / panes, 1.51, 'z', true);
      }
    }
    for (const dz of [-d * 0.27, d * 0.27]) lightStrip(x, z + dz, w * 0.42);
    door(inner, z, side, name);
    furnish(volume, type);
    if (index !== undefined && index !== null) putClue(index, x, z - Math.min(1.85, d / 2 - 0.75));
    if (npc !== undefined && npc !== null) avatar(npc, x + side * 1.62, z - Math.min(1.48, d / 2 - 0.7));
  }

  const layouts = [
    [
      ['Accueil', 0, -1, -0.4, 8.5, 6.6, 'reception', 0, 6],
      ...['005', '004', '003', '002', '001'].map((number, i) =>
        ['Salle ' + number, 0, -1, -7.2 - i * 5.85, 7.9, 5.65, 'class', i === 1 ? 1 : i === 3 ? 2 : null]),
      ['Amphi A', 0, -1, -39.5, 11.5, 10.3, 'amphi', 3],
      ['Hall des rencontres', 24, 1, -2.8, 8.5, 9.3, 'meeting']
    ],
    [
      ['Salle de réunion', 0, -1, -0.5, 8.4, 6.6, 'meeting', 4, 0],
      ...['105', '104', '103', '102', '101'].map((number, i) =>
        ['Salle ' + number, 0, -1, -7.2 - i * 5.85, 7.9, 5.65, 'class', i === 2 ? 5 : null]),
      ['Amphi B', 0, -1, -39.5, 11.5, 10.3, 'amphi', 6, 2],
      ...['109', '110', '111', '112', '113', '114'].map((number, i) =>
        ['Salle ' + number, 24, -1, -3.8 - i * 6.6, 7.9, 6.4, 'class', i === 1 ? 7 : null]),
      ['Toilettes H / F', 24, 1, -4.2, 6.5, 5.9, 'toilets'],
      ['Amphi C', 24, 1, -30.2, 10.0, 12.2, 'amphi', null, 3]
    ],
    [
      ['Info 1', 0, -1, -7.3, 8.6, 7.6, 'info', 8, 1],
      ['Info 2', 0, -1, -15.8, 8.6, 8, 'info', 9],
      ['Info 3', 0, -1, -24.7, 8.6, 8.2, 'info'],
      ['Salle des profs', 0, -1, -37.1, 11.2, 10.2, 'office', 10],
      ['Espace café', 0, 1, -2.7, 7.4, 7.1, 'cafe'],
      ['Toilettes H / F', 24, -1, -4.5, 6.4, 6.2, 'toilets'],
      ['LEXIM', 24, -1, -14.2, 8.5, 10.9, 'lexim', 11],
      ['Amphi D', 24, -1, -32.6, 9.2, 12.5, 'amphi', 12],
      ['Salle de cours', 24, 1, -9.6, 8.0, 8.2, 'class', null, 5],
      ['Salle de cours', 24, 1, -19.2, 8.0, 9.0, 'class'],
      ['Palier amphi C', 24, 1, -32.6, 8.0, 8.1, 'meeting']
    ],
    [
      ['Cafétéria étudiante', 24, -1, -4.4, 9.5, 14.5, 'cafe', 13],
      ['Info 4', 24, -1, -18.2, 7.8, 7.6, 'info'],
      ['Administration', 24, -1, -30.5, 9.2, 9.8, 'office', 14, 4],
      ['Toilettes', 24, 1, -4.1, 6.2, 5.7, 'toilets'],
      ['Toilettes', 24, 1, -10.2, 6.2, 5.7, 'toilets']
    ]
  ];

  function stairs(x, z, destination, arrival, direction = -1) {
    const title = destination > level ? 'Monter · ' + ILIS_LEVELS[destination].short : 'Descendre · ' + ILIS_LEVELS[destination].short;
    const use = () => actions.changeFloor(destination, arrival);
    for (let step = 0; step < 8; step++) {
      const height = 0.15 + step * 0.14;
      addBox(x, height / 2, z + direction * step * 0.235, 1.08, height, 0.24, '#6f8493', { action: use, title });
    }
    railing(x - 0.56, 0.04, z + direction * 0.88, 1.92, 'z');
    colliders.push({ x, z: z + direction * 0.9, w: 1.16, d: 1.93 });
    plaque(title, x - 0.20, 1.69, z - direction * 0.12, 1.51, 0.38, {
      color: '#284f6d', action: use, title
    });
  }

  function corridor(wing) {
    const end = level === 3 ? -37.0 : corridorEnd;
    const length = facadeZ - end;
    const center = (facadeZ + end) / 2;
    floorSurface(wing, center, width, length, terrazzo);
    walkable(wing, center, width + 0.04, length, 'Couloir');
    ceilingTiles(wing, center, width, length);
    for (let z = facadeZ - 1; z > end; z -= 4.5) lightStrip(wing, z);
    wall(wing, end, width, 0.16, '#b3c3cd');
    if (level > 0 || wing > 0) {
      windowPanel(wing, 1.75, facadeZ, width, 2.92, 'x');
    }

    for (const side of [-1, 1]) {
      const x = wing + side * width / 2;
      const occupied = rooms.filter(r => r.wing === wing && r.side === side)
        .map(r => [r.z - r.d / 2, r.z + r.d / 2]);
      if (level < 3 && ((wing === 0 && side > 0) || (wing === 24 && side < 0))) occupied.push([3.0, facadeZ]);
      occupied.sort((a, b) => a[0] - b[0]);
      const wallPart = (from, to) => {
        if (to - from < 0.07) return;
        wall(x, (from + to) / 2, 0.15, to - from);
        addBox(x - side * 0.084, 0.12, (from + to) / 2, 0.025, 0.18, to - from, '#617484');
        addBox(x - side * 0.086, 1.16, (from + to) / 2, 0.026, 0.11, to - from, ILIS_LEVELS[level].accent);
      };
      let start = end;
      for (const [from, to] of occupied) {
        wallPart(start, from);
        start = Math.max(start, to);
      }
      wallPart(start, facadeZ);
    }
    plaque(ILIS_LEVELS[level].hall, wing, 2.64, 3.78, 3.3, 0.46, {
      color: ILIS_LEVELS[level].accent
    });
  }

  function atrium() {
    const far = 3.0;
    const cut = 6.24;
    const a = width / 2;
    const b = 24 - a;
    const mid = (a + b) / 2;
    const span = b - a;
    const height = floorGap * 3 + 0.32;
    const cutFloor = floorGap * level;

    if (level === 0) {
      floorSurface(mid, (far + facadeZ) / 2, span, facadeZ - far, terrazzo);
      walkable(mid, (far + facadeZ) / 2, span + 0.12, facadeZ - far, 'Hall d’entrée');
      for (const storey of [1, 2]) {
        const elevation = floorGap * storey;
        addBox(mid, elevation - 0.095, (cut + facadeZ) / 2, span, 0.19, facadeZ - cut, '#8797a1');
        railing(mid, elevation, cut, span);
      }
      table(6.9, 4.7, 1.68, 0.64, '#c4ac88');
      planter(4.1, 7.8);
      addBox(0, 0.012, 7.45, 2.65, 0.019, 2.25, '#536573');
      for (const side of [-1, 1]) {
        addBox(side * 2.09, 1.60, 3.04, 0.25, 3.20, 0.28, red, { solid: true });
      }
    } else {
      floorSurface(mid, (cut + facadeZ) / 2, span, facadeZ - cut, terrazzo);
      walkable(mid, (cut + facadeZ) / 2, span + 0.12, facadeZ - cut, 'Passerelle du hall');
      floorSurface(mid, (far + facadeZ) / 2, span, facadeZ - far, terrazzo, -cutFloor);
      railing(mid, 0, cut, span, 'x', true);
    }

    addBox(mid, height / 2 - cutFloor, far - 0.09, span, height, 0.18, '#b6bec0', {
      solid: true, sight: true
    });
    for (const x of [a + 2.0, b - 2.4]) {
      addBox(x, height / 2 - cutFloor, facadeZ - 0.15, 0.42, height, 0.43, red, {
        solid: true
      });
    }
    for (let i = 0; i < 9; i++) {
      const bay = span / 9;
      const x = a + (i + 0.5) * bay;
      for (const storey of [0, 1, 2]) {
        windowPanel(x, storey * floorGap + 1.7 - cutFloor, facadeZ, bay, 2.92, 'x');
      }
      addBox(x, height - cutFloor, 5.93, bay - 0.08, 0.09, facadeZ - far, skylineGlass);
      addBox(x + bay / 2, height - cutFloor - 0.07, 5.93, 0.09, 0.15, facadeZ - far, metal);
    }
    plaque('Université de Lille\nILIS · Campus Santé', 7.3, 2.38 - cutFloor, far + 0.06, 4.1, 1.15,
      { color: '#233e65' });
    plaque('FORUM\nDES ENTREPRISES\nUFR3S · ILIS', 14.9, 5.66 - cutFloor, far + 0.12, 2.15, 4.1,
      { color: '#2865a2' });
    plaque('Rue Ambroise Paré · 42', 7.0, 2.98 - cutFloor, facadeZ + 0.105, 4.6, 0.45,
      { color: '#233e65' });
  }

  function exterior() {
    floorSurface(14.2, 27.5, 73, 37, sidewalk);
    walkable(14.2, 27.53, 73, 37.10, 'Parvis et abords');
    addBox(14.2, -0.21, 27.6, 90, 0.25, 43, '#71866b');
    addBox(13.0, 0.011, 20.7, 73, 0.016, 7.0, '#637382');
    for (let x = -17; x < 50; x += 4.1) {
      addBox(x, 0.025, 20.7, 1.8, 0.014, 0.075, '#d7dfd9');
    }
    for (const dx of [-0.98, -0.57, -0.16, 0.25, 0.66, 1.07]) {
      addBox(dx, 0.033, 19.7, 0.22, 0.014, 3.4, '#e8e9dc');
    }

    const frontSpans = [[-10.75, -2.2], [26.2, 34.5]];
    for (const [from, to] of frontSpans) {
      const bay = (to - from) / 4;
      for (const storey of [0, 1, 2]) {
        const y = storey * floorGap;
        for (let i = 0; i < 4; i++) {
          windowPanel(from + (i + 0.5) * bay, y + 1.78, 7.98, bay, 1.92, 'x', true);
        }
        addBox((from + to) / 2, y + 0.52, 7.98, to - from, 0.70, 0.35, '#a2afb4');
        addBox((from + to) / 2, y + 2.9, 7.98, to - from, 0.44, 0.42, '#607989');
      }
    }
    addBox(-12.0, 4.8, 7.15, 2.5, 9.7, 1.95, '#304a64');
    addBox(-1.49, 1.57, facadeZ, 0.31, 3.15, 0.52, red, { solid: true });
    addBox(1.49, 1.57, facadeZ, 0.31, 3.15, 0.52, red, { solid: true });
    addBox(0, 2.99, facadeZ, 3.26, 0.40, 0.54, red);
    addBox(0, 2.83, facadeZ + 0.80, 3.55, 0.16, 1.56, '#555f72');
    for (const upper of [1, 2]) {
      windowPanel(0, upper * floorGap + 1.7, facadeZ, width, 2.92, 'x');
      addBox(-1.49, upper * floorGap + 1.57, facadeZ, 0.31, 3.3, 0.52, red);
      addBox(1.49, upper * floorGap + 1.57, facadeZ, 0.31, 3.3, 0.52, red);
      windowPanel(24, upper * floorGap + 1.7, facadeZ, width, 2.92, 'x');
    }
    plaque('ILIS', 0, 3.07, facadeZ + 0.28, 1.42, 0.38, { color: red });
    plaque('Rue Ambroise Paré', -9.0, 1.45, 16.0, 3.5, 0.34, { color: '#346087' });
    plaque('← Avenue Eugène Avinée', -18.0, 1.78, 26.4, 4.2, 0.44, { color: '#346087' });

    addBox(30.3, 2.42, 35.65, 12.0, 4.84, 9.4, '#b1b7ad', { solid: true });
    addBox(30.3, 4.84, 35.65, 12.65, 0.32, 9.85, '#536d7c');
    for (let i = -2; i <= 2; i++) windowPanel(30.3 + i * 2.2, 1.68, 30.91, 2.2, 2.63, 'x');
    plaque('RU L’Épi', 30.3, 3.43, 30.87, 3.92, 0.58, { color: '#426d56', yaw: Math.PI });
    putClue(15, 29.0, 27.3);

    for (const [x, z] of [[-17.2, 26.5], [8.5, 27.2], [20.2, 41.2], [42.8, 29.3], [41.7, 17.6]]) {
      addBox(x, 1.51, z, 0.26, 3.02, 0.26, '#765744', { solid: true });
      sphere(world, '#527d58', [x, 3.28, z], [1.34, 1.69, 1.26]);
      sphere(world, '#779761', [x + 0.48, 3.86, z - 0.16], [0.94, 1.19, 0.84]);
    }
    for (const x of [-8, -4.1, 3.2]) {
      addBox(x, 0.50, 12.85, 2.0, 0.11, 0.48, oak, { solid: true });
      addBox(x, 0.82, 12.60, 2.0, 0.14, 0.06, oak);
      addBox(x, 0.23, 12.83, 1.72, 0.45, 0.10, '#5c6c73');
    }
  }

  function setPlacements() {
    if (level === 0) {
      stairs(1.52, 0.80, 1, { x: 0, z: 2.4 });
      stairs(1.52, -34.9, 1, { x: 0, z: -32.6 });
    } else if (level === 1) {
      stairs(1.52, 0.80, 0, { x: 0, z: 2.4 });
      stairs(1.52, -34.9, 2, { x: 0, z: -32.6 });
      stairs(25.52, -21.2, 2, { x: 24, z: -19.0 });
    } else if (level === 2) {
      stairs(1.52, -34.9, 1, { x: 0, z: -32.6 });
      stairs(25.52, -21.2, 1, { x: 24, z: -19.0 });
      stairs(25.52, -25.0, 3, { x: 24, z: -23.0 });
    } else {
      stairs(25.52, -25.0, 2, { x: 24, z: -23.0 });
    }
  }

  function dispose() {
    sceneRoot.remove(world);
    world.traverse(mesh => {
      if (mesh.geometry && mesh.geometry !== boxGeometry && mesh.geometry !== roundGeometry) mesh.geometry.dispose();
      if (mesh.isInstancedMesh) mesh.dispose();
      if (mesh.userData.ownedMaterial) {
        if (!mesh.userData.keepMap) mesh.material.map?.dispose();
        mesh.material.dispose();
      }
    });
  }

  function build(nextLevel) {
    if (world) dispose();
    level = nextLevel;
    world = new T.Group();
    sceneRoot.add(world);
    floors = [];
    rooms = [];
    colliders = [];
    interactables = [];
    blockers = [];
    characters = [];
    batches = new Map();
    noteMeshes = new Map();
    layouts[level].forEach(spec => room(...spec));
    if (level < 3) {
      corridor(0);
      atrium();
    }
    corridor(24);
    if (level === 0) exterior();
    setPlacements();

    for (const { material: surface, meshes, sight } of batches.values()) {
      const batch = new T.InstancedMesh(boxGeometry, surface, meshes.length);
      meshes.forEach((matrix, i) => batch.setMatrixAt(i, matrix));
      batch.instanceMatrix.needsUpdate = true;
      world.add(batch);
      if (sight) blockers.push(batch);
    }
    world.updateMatrixWorld(true);
  }

  function isWalkable(x, z) {
    return floors.some(f => Math.abs(x - f.x) < f.w / 2 && Math.abs(z - f.z) < f.d / 2)
      && !colliders.some(c => Math.abs(x - c.x) < c.w / 2 + 0.18 && Math.abs(z - c.z) < c.d / 2 + 0.18);
  }

  function placeName(x, z) {
    const inside = area => Math.abs(x - area.x) < area.w / 2 && Math.abs(z - area.z) < area.d / 2;
    return rooms.find(inside)?.name || floors.find(inside)?.name || 'Couloir';
  }

  function aim(ray, maxRange = 4) {
    const nearest = ray.intersectObjects(interactables).find(hit => hit.distance <= maxRange);
    if (!nearest) return null;
    sightRay.ray.copy(ray.ray);
    sightRay.far = Math.max(0.02, nearest.distance - 0.04);
    return sightRay.intersectObjects(blockers).length ? null : nearest.object;
  }

  function animate(eye) {
    for (const person of characters) {
      compass.copy(eye).sub(person.position);
      person.rotation.y = Math.atan2(compass.x, compass.z);
      person.updateMatrixWorld(true);
    }
    for (const item of interactables) {
      if (item.userData.facePlayer) {
        compass.copy(eye).sub(item.position);
        item.rotation.y = Math.atan2(compass.x, compass.z);
        item.updateMatrixWorld(true);
      }
    }
  }

  function markFound(index) {
    const document = noteMeshes.get(index);
    if (document) document.material = material('#71a695');
  }

  return { build, isWalkable, placeName, aim, animate, markFound };
}

function portraitUrl(character) {
  return 'assets/visages/' + character.portrait + '.jpg';
}
