// Three.js Council Chamber — enhanced game visual
window.Scene3D = (() => {
  'use strict';

  let renderer, scene, camera;
  let prevTime = 0;
  // 顺序决定 3D 圆圈位置。从相机 (0,8,14) 看向原点，+x = 屏幕右侧。
  // idx0=前中, idx1=右前, idx2=右后, idx3=后中, idx4=左后, idx5=左前
  // 使右列 agent (gambler,psych,moderator) 落在 3D 右侧，左列 (stat,mystic,history) 落在左侧。
  const AGENT_ORDER = ['moderator','gambler','psych','stat','history','mystic'];
  const COLORS = {
    stat:0x4a9eff, mystic:0xbf5fff, history:0xffaa00,
    gambler:0x00e096, psych:0x00d2d3, moderator:0xffd700,
  };
  const ICONS  = { stat:'📊', mystic:'🔮', history:'📜', gambler:'🎰', psych:'🧠', moderator:'⚖️' };
  const NAMES  = { stat:'Dr.冰狗', mystic:'月影姐', history:'老球迷', gambler:'赌狗本狗', psych:'碎碎念', moderator:'议长' };
  const TITLES = { stat:'数据帝', mystic:'玄学博主', history:'历史区元老', gambler:'盘口派', psych:'心理观察员', moderator:'主播' };
  const RADIUS = 4.5;
  const nodes = {};

  const camState = {
    pos:  new THREE.Vector3(0, 4.5, 18),
    look: new THREE.Vector3(0, 2.2, 0),
  };
  const camCurPos  = new THREE.Vector3(0, 4.5, 18);
  const camCurLook = new THREE.Vector3(0, 2.2, 0);
  let   camLerp    = 0.048;
  const bursts  = [];

  // ── 赛况大屏状态 ─────────────────────────────────────────────
  let statsBoardCtx = null, statsBoardTex = null;
  let statsBoardHome = '主队', statsBoardAway = '客队';

  let energyArc   = null;
  let speakingHalo= null;
  let currentSpeakerId = null;
  let orbitAngle = 0;
  let orbitPaused = false;
  let floorGlow   = null;

  // ── Init ────────────────────────────────────────────────
  function init(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020d08, 0.020);

    camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.3, 200);
    camera.position.copy(camState.pos);
    camera.lookAt(camState.look);

    buildScene();
    requestAnimationFrame(loop);

    new ResizeObserver(() => {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    }).observe(canvas);
  }

  // ── Scene build ──────────────────────────────────────────
  function buildScene() {
    // 升级灯光：演播厅风格
    scene.add(new THREE.AmbientLight(0x0a1020, 3.5));

    // 主顶灯
    const mainLight = new THREE.DirectionalLight(0x7088cc, 1.2);
    mainLight.position.set(0, 12, 4); scene.add(mainLight);

    // 舞台绿白球场光
    const stageLight = new THREE.PointLight(0x334422, 1.8, 35);
    stageLight.position.set(0, 8, 0); scene.add(stageLight);

    // 左右侧面渐变光（球场聚光灯暖白）
    const sideL = new THREE.SpotLight(0x88aaff, 1.5, 30, Math.PI/5, 0.3);
    sideL.position.set(-12, 8, 0); sideL.target.position.set(0, 0, 0);
    scene.add(sideL); scene.add(sideL.target);

    const sideR = new THREE.SpotLight(0x88aaff, 1.2, 30, Math.PI/5, 0.3);
    sideR.position.set(12, 8, 0); sideR.target.position.set(0, 0, 0);
    scene.add(sideR); scene.add(sideR.target);

    // 后部填充光
    const backLight = new THREE.PointLight(0x000833, 1.2, 22);
    backLight.position.set(0, 3, -12); scene.add(backLight);

    // 场景元素
    makeStadiumStands(); makeStudioWalls();
    makePlayerCardWall(); makeStatsBoardPlane();
    makeTableRing(); makeOuterRing();
    AGENT_ORDER.forEach((id, i) => makeThrone(id, i));
    makeBroadcastDesks();
    makeCenterFootball();
  }

  // ── 悬浮赛况大屏 ─────────────────────────────────────────────
  function drawStatsBoard(ctx, home, away, homeP, drawP, awayP) {
    const W = 1024, H = 256;
    ctx.clearRect(0, 0, W, H);

    // 背景渐变（中间实、两端透明）
    const bg = ctx.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0,   'rgba(0,20,8,0)');
    bg.addColorStop(0.08,'rgba(0,20,8,0.93)');
    bg.addColorStop(0.92,'rgba(0,20,8,0.93)');
    bg.addColorStop(1,   'rgba(0,20,8,0)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // 顶部金绿渐变分隔线
    const topLine = ctx.createLinearGradient(0, 0, W, 0);
    topLine.addColorStop(0, 'transparent');
    topLine.addColorStop(0.2, 'rgba(0,212,106,0.7)');
    topLine.addColorStop(0.8, 'rgba(200,168,50,0.7)');
    topLine.addColorStop(1, 'transparent');
    ctx.strokeStyle = topLine; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(W, 2); ctx.stroke();

    // 队名
    ctx.font = 'bold 42px "PingFang SC","Microsoft YaHei",Arial,sans-serif';
    ctx.fillStyle = '#e8f0ff';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,180,80,0.5)'; ctx.shadowBlur = 10;
    ctx.fillText(home.length > 5 ? home.slice(0,5) : home, 56, 66);
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(200,60,60,0.5)';
    ctx.fillText(away.length > 5 ? away.slice(0,5) : away, W - 56, 66);
    ctx.shadowBlur = 0;

    // 中间 VS
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.fillStyle = 'rgba(200,168,50,0.85)';
    ctx.fillText('VS', W / 2, 56);

    // 概率标题
    ctx.font = '14px "PingFang SC","Microsoft YaHei",Arial,sans-serif';
    ctx.fillStyle = 'rgba(0,212,106,0.55)';
    ctx.fillText('A I   P R E D I C T I O N', W / 2, 75);

    // 概率条
    const BAR_X = 56, BAR_Y = 95, BAR_H = 34, BAR_W = W - 112;
    const hW = BAR_W * homeP / 100;
    const dW = BAR_W * drawP / 100;
    const aW = BAR_W * awayP / 100;

    // 主队（蓝）
    ctx.fillStyle = 'rgba(30,80,190,0.82)';
    ctx.fillRect(BAR_X, BAR_Y, hW, BAR_H);
    // 平局（绿）
    ctx.fillStyle = 'rgba(0,130,50,0.75)';
    ctx.fillRect(BAR_X + hW, BAR_Y, dW, BAR_H);
    // 客队（红）
    ctx.fillStyle = 'rgba(170,30,40,0.82)';
    ctx.fillRect(BAR_X + hW + dW, BAR_Y, aW, BAR_H);

    // 条上百分比标注
    ctx.font = 'bold 18px Arial,sans-serif';
    ctx.fillStyle = '#ffffff';
    if (hW > 55) { ctx.textAlign = 'center'; ctx.fillText(`${Math.round(homeP)}%`, BAR_X + hW / 2, BAR_Y + 23); }
    if (dW > 55) { ctx.textAlign = 'center'; ctx.fillText(`${Math.round(drawP)}%`, BAR_X + hW + dW / 2, BAR_Y + 23); }
    if (aW > 55) { ctx.textAlign = 'center'; ctx.fillText(`${Math.round(awayP)}%`, BAR_X + hW + dW + aW / 2, BAR_Y + 23); }

    // 标签行
    ctx.font = '14px "PingFang SC","Microsoft YaHei",Arial,sans-serif';
    ctx.fillStyle = 'rgba(200,220,255,0.55)';
    ctx.textAlign = 'left';  ctx.fillText('主队胜', BAR_X, BAR_Y + BAR_H + 22);
    ctx.textAlign = 'center'; ctx.fillText('平  局', W / 2, BAR_Y + BAR_H + 22);
    ctx.textAlign = 'right';  ctx.fillText('客队胜', BAR_X + BAR_W, BAR_Y + BAR_H + 22);

    // 底部分隔线
    const botLine = ctx.createLinearGradient(0, H - 2, W, H - 2);
    botLine.addColorStop(0, 'transparent');
    botLine.addColorStop(0.3, 'rgba(200,168,50,0.35)');
    botLine.addColorStop(0.7, 'rgba(0,212,106,0.35)');
    botLine.addColorStop(1, 'transparent');
    ctx.strokeStyle = botLine; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, H - 3); ctx.lineTo(W, H - 3); ctx.stroke();
  }

  function makeStatsBoardPlane() {
    const cvs = document.createElement('canvas');
    cvs.width = 1024; cvs.height = 256;
    statsBoardCtx = cvs.getContext('2d');
    drawStatsBoard(statsBoardCtx, statsBoardHome, statsBoardAway, 33, 34, 33);

    statsBoardTex = new THREE.CanvasTexture(cvs);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(RADIUS * 4.4, RADIUS * 1.1),
      new THREE.MeshBasicMaterial({ map: statsBoardTex, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
    );
    plane.position.set(0, 5.2, -(RADIUS * 1.6));
    plane.userData.statsBoard = true;
    scene.add(plane);
  }

  // ── 球星英雄卡墙 ─────────────────────────────────────────────
  const cardNodes = []; // {plane, cvs, ctx, tex}

  function drawHeroCard(ctx, photoImg, name, color, side) {
    const W = 256, H = 400;
    ctx.clearRect(0, 0, W, H);

    // 卡片背景：以球队色为主色调的渐变（足够亮，MeshBasicMaterial 不响应光照）
    const isSideHome = side === 'home';
    // 解析颜色为 RGB
    const cr = parseInt(color.slice(1,3)||'44',16)||68;
    const cg = parseInt(color.slice(3,5)||'88',16)||136;
    const cb = parseInt(color.slice(5,7)||'ff',16)||255;
    const bgGrd = ctx.createLinearGradient(0, 0, 0, H);
    bgGrd.addColorStop(0,   `rgba(${cr},${cg},${cb},0.85)`);
    bgGrd.addColorStop(0.35,`rgba(${Math.round(cr*0.4)},${Math.round(cg*0.4)},${Math.round(cb*0.4)},0.9)`);
    bgGrd.addColorStop(1,   `rgba(${Math.round(cr*0.15)},${Math.round(cg*0.15)},${Math.round(cb*0.15)},0.95)`);
    ctx.fillStyle = bgGrd; ctx.fillRect(0, 0, W, H);

    // 外框（鲜明边框）
    const borderGlow = side === 'neutral' ? 'rgba(220,185,60,1.0)' : (isSideHome ? 'rgba(80,160,255,1.0)' : 'rgba(255,80,80,1.0)');
    ctx.shadowColor = borderGlow; ctx.shadowBlur = 12;
    ctx.strokeStyle = borderGlow; ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.shadowBlur = 0;
    // 内框
    ctx.strokeStyle = 'rgba(220,185,60,0.6)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(8, 8, W - 16, H - 16);

    // 顶部彩带（FIFA 卡片样式）
    const ribbon = ctx.createLinearGradient(0, 0, W, 0);
    ribbon.addColorStop(0, color + '00');
    ribbon.addColorStop(0.3, color + 'cc');
    ribbon.addColorStop(0.7, color + 'cc');
    ribbon.addColorStop(1, color + '00');
    ctx.fillStyle = ribbon; ctx.fillRect(3, 3, W - 6, 28);

    // ORACLE COUNCIL 标题
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.letterSpacing = '2px';
    ctx.fillText('ORACLE COUNCIL', W / 2, 22);

    // 照片区域（或渐变占位）
    const photoY = 34, photoH = 210;
    if (photoImg) {
      // 等比例裁剪到矩形区域（取头部中心）
      const srcAR = photoImg.naturalWidth / photoImg.naturalHeight;
      const dstAR = (W - 20) / photoH;
      let sx = 0, sy = 0, sw = photoImg.naturalWidth, sh = photoImg.naturalHeight;
      if (srcAR > dstAR) {
        // 太宽，裁两侧
        sw = photoImg.naturalHeight * dstAR;
        sx = (photoImg.naturalWidth - sw) / 2;
      } else {
        // 太高，取上半部
        sh = photoImg.naturalWidth / dstAR;
        sy = 0; // 从顶部开始（球员面部通常在上方）
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(10, photoY, W - 20, photoH);
      ctx.clip();
      ctx.drawImage(photoImg, sx, sy, sw, sh, 10, photoY, W - 20, photoH);
      ctx.restore();
      // 底部渐变遮罩（让照片自然过渡到名片区）
      const fadeGrad = ctx.createLinearGradient(0, photoY + photoH * 0.6, 0, photoY + photoH);
      fadeGrad.addColorStop(0, 'rgba(0,0,0,0)');
      fadeGrad.addColorStop(1, 'rgba(2,6,20,0.95)');
      ctx.fillStyle = fadeGrad; ctx.fillRect(10, photoY, W - 20, photoH);
    } else {
      // 无照片：渐变背景 + 球员姓名首字占位
      const silGrad = ctx.createRadialGradient(W / 2, photoY + photoH * 0.4, 0, W / 2, photoY + photoH * 0.5, 110);
      silGrad.addColorStop(0, color + '44'); silGrad.addColorStop(0.6, color + '18'); silGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = silGrad; ctx.fillRect(10, photoY, W - 20, photoH);
      // 大号首字
      const firstChar = (name || '?')[0];
      ctx.font = 'bold 100px "PingFang SC","Microsoft YaHei",Arial,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 30;
      ctx.fillText(firstChar, W / 2, photoY + photoH * 0.45);
      ctx.shadowBlur = 0; ctx.textBaseline = 'alphabetic';
      // 足球图标
      ctx.font = '50px serif';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText('⚽', W / 2, photoY + photoH * 0.80);
    }

    // 名片底部背景
    const npY = photoY + photoH + 4;
    const npBg = ctx.createLinearGradient(0, npY, 0, H - 8);
    npBg.addColorStop(0, 'rgba(0,0,0,0.6)'); npBg.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = npBg; ctx.fillRect(8, npY, W - 16, H - npY - 8);

    // 分隔金线
    const divLine = ctx.createLinearGradient(8, npY, W - 8, npY);
    divLine.addColorStop(0, 'transparent'); divLine.addColorStop(0.3, 'rgba(200,168,50,0.7)'); divLine.addColorStop(0.7, 'rgba(200,168,50,0.7)'); divLine.addColorStop(1, 'transparent');
    ctx.strokeStyle = divLine; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(8, npY + 1); ctx.lineTo(W - 8, npY + 1); ctx.stroke();

    // 球员名字
    const displayName = (name || '???').length > 6 ? (name || '???').slice(0, 6) : (name || '???');
    ctx.font = 'bold 24px "PingFang SC","Microsoft YaHei",Arial,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff'; ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.fillText(displayName, W / 2, npY + 34);
    ctx.shadowBlur = 0;

    // 副标题（主队/客队）
    ctx.font = '12px "PingFang SC","Microsoft YaHei",Arial,sans-serif';
    ctx.fillStyle = 'rgba(200,168,50,0.75)';
    const sideLabel = side === 'home' ? '★ 主队球星 ★' : side === 'away' ? '★ 客队球星 ★' : '★ 球星传奇 ★';
    ctx.fillText(sideLabel, W / 2, npY + 55);

    // 底部装饰
    ctx.font = 'bold 9px Arial'; ctx.fillStyle = 'rgba(200,168,50,0.25)'; ctx.letterSpacing = '3px';
    ctx.fillText('WORLD CUP 2026', W / 2, H - 12);
  }

  function makePlayerCardWall() {
    // 6 张英雄卡沿背景墙横向排列（正对摄像机）
    const WALL_Z = -(RADIUS * 2.05);
    const xPositions = [-5.2, -3.1, -1.0, 1.0, 3.1, 5.2];
    const CARD_W = 1.65, CARD_H = 2.6;
    const defaultColors = ['#4a9eff','#ff4455','#4a9eff','#ff4455','#4a9eff','#ff4455'];
    const defaultSides  = ['home','away','home','away','home','away'];

    xPositions.forEach((x, i) => {
      const cvs = document.createElement('canvas');
      cvs.width = 256; cvs.height = 400;
      const ctx = cvs.getContext('2d');
      drawHeroCard(ctx, null, null, defaultColors[i], defaultSides[i]);

      const tex = new THREE.CanvasTexture(cvs);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(CARD_W, CARD_H),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, side: THREE.DoubleSide })
      );
      plane.position.set(x, 1.4, WALL_Z);
      scene.add(plane);
      cardNodes.push({ plane, cvs, ctx, tex, index: i });
    });

    // 卡片墙补光（从上方打下，模拟展览灯光）
    const cardWallLight = new THREE.PointLight(0xffffff, 1.2, 18);
    cardWallLight.position.set(0, 5.5, WALL_Z + 3);
    scene.add(cardWallLight);
  }

  function loadPlayerBanners(players) {
    players.forEach((p, i) => {
      const node = cardNodes[i]; if (!node) return;
      const color = p.color || (p.side === 'home' ? '#4a9eff' : '#ff4455');
      // 先用占位符渲染
      drawHeroCard(node.ctx, null, p.name, color, p.side);
      node.tex.needsUpdate = true;
      // 有照片 URL 则加载后重绘
      if (p.photoUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          drawHeroCard(node.ctx, img, p.name, color, p.side);
          node.tex.needsUpdate = true;
        };
        img.onerror = () => {};
        img.src = p.photoUrl;
      }
    });
  }

  // ── 球场看台观众席 ──────────────────────────────────────────
  function makeStadiumStands() {
    // 三层看台（向外扩展的圆形阶梯）
    const tierDefs = [
      { rIn: RADIUS * 2.4, rOut: RADIUS * 2.9, h: 1.5, y: 0.0 },
      { rIn: RADIUS * 2.9, rOut: RADIUS * 3.5, h: 3.0, y: 1.5 },
      { rIn: RADIUS * 3.5, rOut: RADIUS * 4.2, h: 5.2, y: 3.0 },
    ];
    tierDefs.forEach(({ rIn, rOut, h, y }) => {
      // 看台面（环形平面）
      const seatsGeo = new THREE.RingGeometry(rIn, rOut, 48);
      const seatsMat = new THREE.MeshStandardMaterial({
        color: 0x0d1e10,
        roughness: 0.95,
        metalness: 0.05,
        side: THREE.DoubleSide,
      });
      const seatsMesh = new THREE.Mesh(seatsGeo, seatsMat);
      seatsMesh.rotation.x = -Math.PI / 2;
      seatsMesh.position.y = y;
      scene.add(seatsMesh);

      // 看台侧壁（垂直挡板）
      const wallGeo = new THREE.CylinderGeometry(rIn, rIn, h, 48, 1, true);
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0x0a1a0d,
        roughness: 0.9,
        metalness: 0.1,
        side: THREE.BackSide,
      });
      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.position.y = y - h / 2;
      scene.add(wallMesh);
    });

    // 观众席发光点（模拟球迷手机灯光 / 荧光棒）
    const crowdLayers = [
      { r: RADIUS * 2.65, cnt: 160, col: 0x88ccff, sz: 0.045, op: 0.35 },
      { r: RADIUS * 3.15, cnt: 220, col: 0xffeebb, sz: 0.05,  op: 0.3  },
      { r: RADIUS * 3.8,  cnt: 280, col: 0xaaddff, sz: 0.055, op: 0.25 },
    ];
    crowdLayers.forEach(({ r, cnt, col, sz, op }, li) => {
      const pos = new Float32Array(cnt * 3);
      for (let j = 0; j < cnt; j++) {
        const a = (j / cnt) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const rr = r + (Math.random() - 0.5) * 0.8;
        pos[j * 3]     = Math.cos(a) * rr;
        pos[j * 3 + 1] = tierDefs[Math.min(li, 2)].y + Math.random() * tierDefs[Math.min(li, 2)].h * 0.85;
        pos[j * 3 + 2] = Math.sin(a) * rr;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
        color: col, size: sz, transparent: true, opacity: op, sizeAttenuation: true,
      })));
    });

    // 看台顶部边缘霓虹灯带（世界杯绿+金）
    [{ r: RADIUS * 2.4, col: 0x00aa44, op: 0.25 },
     { r: RADIUS * 2.95, col: 0xc8a832, op: 0.15 },
     { r: RADIUS * 3.52, col: 0x00aa44, op: 0.12 }].forEach(({ r, col, op }) => {
      const ledRing = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.025, 4, 80),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op })
      );
      ledRing.rotation.x = Math.PI / 2;
      ledRing.position.y = 0.1;
      scene.add(ledRing);
    });
  }

  function makeStudioWalls() {
    // === 后方弧形演播室墙体 ===
    const wallGeo = new THREE.CylinderGeometry(RADIUS * 2.8, RADIUS * 2.8, 9, 48, 1, true, -Math.PI * 0.7, Math.PI * 1.4);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x010a06, emissive: 0x020c08, emissiveIntensity: 1,
      side: THREE.BackSide, metalness: 0.35, roughness: 0.85,
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.y = 2; scene.add(wall);

    // 墙上 LED 发光横条（演播室墙面氛围灯）
    const ledColors = [0x003318, 0x004422, 0x002a14, 0x001a0a];
    for (let i = 0; i < 5; i++) {
      const stripGeo = new THREE.CylinderGeometry(RADIUS*2.78, RADIUS*2.78, 0.055, 48, 1, true, -Math.PI*0.68, Math.PI*1.36);
      const stripMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x005522 : 0x003311,
        transparent: true, opacity: 0.55, side: THREE.BackSide,
      });
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.position.y = 0.5 + i * 1.5;
      scene.add(strip);
    }

    // 后墙底部金色装饰条
    const goldenBase = new THREE.Mesh(
      new THREE.CylinderGeometry(RADIUS*2.79, RADIUS*2.79, 0.12, 48, 1, true, -Math.PI*0.68, Math.PI*1.36),
      new THREE.MeshBasicMaterial({ color: 0x4a3800, transparent: true, opacity: 0.7, side: THREE.BackSide })
    );
    goldenBase.position.y = -0.5; scene.add(goldenBase);

    // === 后方中央 LED 大屏（演播室标志性背景屏）===
    const bigScreenCvs = document.createElement('canvas');
    bigScreenCvs.width = 1024; bigScreenCvs.height = 512;
    const bsCtx = bigScreenCvs.getContext('2d');

    // 屏幕背景：深色+渐变
    const bsGrad = bsCtx.createLinearGradient(0, 0, 0, 512);
    bsGrad.addColorStop(0, 'rgba(0,18,8,0.98)');
    bsGrad.addColorStop(1, 'rgba(0,10,4,0.98)');
    bsCtx.fillStyle = bsGrad; bsCtx.fillRect(0, 0, 1024, 512);

    // 上方绿金色分隔线
    const topGrad = bsCtx.createLinearGradient(0, 0, 1024, 0);
    topGrad.addColorStop(0, 'transparent');
    topGrad.addColorStop(0.15, 'rgba(0,200,80,0.8)');
    topGrad.addColorStop(0.85, 'rgba(200,160,40,0.8)');
    topGrad.addColorStop(1, 'transparent');
    bsCtx.strokeStyle = topGrad; bsCtx.lineWidth = 3;
    bsCtx.beginPath(); bsCtx.moveTo(0, 6); bsCtx.lineTo(1024, 6); bsCtx.stroke();

    // FIFA WORLD CUP 2026 主标题
    bsCtx.font = 'bold 72px Arial, sans-serif';
    bsCtx.textAlign = 'center'; bsCtx.textBaseline = 'middle';
    bsCtx.fillStyle = '#c8a832';
    bsCtx.shadowColor = '#00d46a'; bsCtx.shadowBlur = 24;
    bsCtx.fillText('FIFA WORLD CUP 2026', 512, 130);
    bsCtx.shadowBlur = 0;

    // 副标题
    bsCtx.font = 'bold 32px Arial, sans-serif';
    bsCtx.fillStyle = 'rgba(0,212,106,0.85)';
    bsCtx.letterSpacing = '8px';
    bsCtx.fillText('ORACLE COUNCIL · AI PREDICTION', 512, 210);

    // 中间分隔线
    bsCtx.strokeStyle = 'rgba(200,168,50,0.3)'; bsCtx.lineWidth = 1;
    bsCtx.beginPath(); bsCtx.moveTo(80, 248); bsCtx.lineTo(944, 248); bsCtx.stroke();

    // 六个 agent 图标行
    const agentIcons = ['📊', '🔮', '📜', '🎰', '🧠', '⚖️'];
    const agentColors = ['#4a9eff', '#bf5fff', '#ffaa00', '#00e096', '#00d2d3', '#ffd700'];
    bsCtx.font = '36px serif';
    agentIcons.forEach((icon, i) => {
      const ax = 120 + i * 140;
      bsCtx.fillStyle = agentColors[i];
      bsCtx.shadowColor = agentColors[i]; bsCtx.shadowBlur = 8;
      bsCtx.fillText(icon, ax, 310);
      bsCtx.shadowBlur = 0;
    });

    // 底部装饰
    bsCtx.font = '22px Arial, sans-serif';
    bsCtx.fillStyle = 'rgba(200,220,255,0.3)';
    bsCtx.letterSpacing = '4px';
    bsCtx.fillText('PREDICT · DEBATE · DECIDE', 512, 420);

    // 底部金线
    bsCtx.strokeStyle = topGrad; bsCtx.lineWidth = 2;
    bsCtx.beginPath(); bsCtx.moveTo(0, 505); bsCtx.lineTo(1024, 505); bsCtx.stroke();

    const bigScreenTex = new THREE.CanvasTexture(bigScreenCvs);
    const bigScreen = new THREE.Mesh(
      // F1: 背景板缩小至 60%，减淡 opacity，避免遮挡 agent
      new THREE.PlaneGeometry(RADIUS * 2.2, RADIUS * 1.1),
      new THREE.MeshBasicMaterial({ map: bigScreenTex, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
    );
    bigScreen.position.set(0, 4.5, -(RADIUS * 2.72));
    scene.add(bigScreen);

    // 大屏外框（发光边框）—— 也一起缩小
    const frameGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(RADIUS * 2.25, RADIUS * 1.15, 0.05));
    const frameMat = new THREE.LineBasicMaterial({ color: 0x1a4a8a, transparent: true, opacity: 0.3 });
    const frameLines = new THREE.LineSegments(frameGeo, frameMat);
    frameLines.position.set(0, 4.5, -(RADIUS * 2.71));
    scene.add(frameLines);

    // ── 世界杯 2026 LED 大屏文字横幅 ─────────────────────────
    const bannerCvs = document.createElement('canvas');
    bannerCvs.width = 1024; bannerCvs.height = 128;
    const bctx = bannerCvs.getContext('2d');
    // 渐变背景
    const bannerBg = bctx.createLinearGradient(0, 0, 1024, 0);
    bannerBg.addColorStop(0, 'rgba(0,40,10,0)');
    bannerBg.addColorStop(0.15, 'rgba(0,60,20,0.85)');
    bannerBg.addColorStop(0.5, 'rgba(0,80,25,0.95)');
    bannerBg.addColorStop(0.85, 'rgba(0,60,20,0.85)');
    bannerBg.addColorStop(1, 'rgba(0,40,10,0)');
    bctx.fillStyle = bannerBg;
    bctx.fillRect(0, 0, 1024, 128);
    // 主标题
    bctx.font = 'bold 46px Arial, sans-serif';
    bctx.textAlign = 'center'; bctx.textBaseline = 'middle';
    bctx.fillStyle = '#c8a832';
    bctx.shadowColor = '#00d46a'; bctx.shadowBlur = 18;
    bctx.fillText('⚽  WORLD CUP 2026  ⚽', 512, 48);
    bctx.shadowBlur = 0;
    // 副标题
    bctx.font = '20px Arial, sans-serif';
    bctx.fillStyle = 'rgba(0,212,106,0.7)';
    bctx.letterSpacing = '6px';
    bctx.fillText('AI PREDICTION · ORACLE COUNCIL', 512, 94);
    // 装饰横线
    bctx.strokeStyle = 'rgba(200,168,50,0.4)';
    bctx.lineWidth = 1.5;
    bctx.beginPath(); bctx.moveTo(60, 70); bctx.lineTo(964, 70); bctx.stroke();
    const bannerTex = new THREE.CanvasTexture(bannerCvs);
    const bannerPlane = new THREE.Mesh(
      // F1: 横幅也缩小，opacity 降低
      new THREE.PlaneGeometry(RADIUS * 3.0, 0.9),
      new THREE.MeshBasicMaterial({ map: bannerTex, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
    );
    bannerPlane.position.set(0, 6.2, -(RADIUS * 2.7));
    bannerPlane.userData.wcBanner = true;
    scene.add(bannerPlane);

    // 演播厅顶部光架（横梁 + 射灯）
    const beamGeo = new THREE.BoxGeometry(RADIUS*4, 0.12, 0.12);
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.2 });
    [-3, 0, 3].forEach(z => {
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(0, 7.5, z);
      scene.add(beam);
      // 射灯锥
      [-4, -2, 0, 2, 4].forEach(x => {
        const coneGeo = new THREE.ConeGeometry(0.15, 0.5, 6);
        const coneMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.95 });
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.set(x, 7.2, z);
        cone.rotation.x = Math.PI;
        scene.add(cone);
      });
    });

    // ── 足球场草坪地板 ──────────────────────────────────────
    // 1. 创建草坪纹理（canvas绘制）
    const pitchCanvas = document.createElement('canvas');
    pitchCanvas.width = 512; pitchCanvas.height = 512;
    const pitchCtx = pitchCanvas.getContext('2d');

    // 绿草条纹背景（深浅交替，真实球场感）
    const stripeH = 512 / 10;
    for (let i = 0; i < 10; i++) {
      pitchCtx.fillStyle = i % 2 === 0 ? '#1a4a1a' : '#1d521d';
      pitchCtx.fillRect(0, i * stripeH, 512, stripeH);
    }

    // 白色场地标线
    pitchCtx.strokeStyle = 'rgba(255,255,255,0.55)';
    pitchCtx.lineWidth = 3;

    // 中圈
    pitchCtx.beginPath();
    pitchCtx.arc(256, 256, 96, 0, Math.PI * 2);
    pitchCtx.stroke();

    // 中点
    pitchCtx.beginPath();
    pitchCtx.arc(256, 256, 6, 0, Math.PI * 2);
    pitchCtx.fillStyle = 'rgba(255,255,255,0.55)';
    pitchCtx.fill();

    // 中线
    pitchCtx.lineWidth = 3;
    pitchCtx.beginPath();
    pitchCtx.moveTo(0, 256); pitchCtx.lineTo(512, 256);
    pitchCtx.stroke();

    // 外边框
    pitchCtx.strokeStyle = 'rgba(255,255,255,0.35)';
    pitchCtx.lineWidth = 4;
    pitchCtx.strokeRect(20, 20, 472, 472);

    // 禁区弧
    pitchCtx.strokeStyle = 'rgba(255,255,255,0.3)';
    pitchCtx.lineWidth = 2;
    pitchCtx.beginPath();
    pitchCtx.arc(256, 256, 148, -Math.PI * 0.35, Math.PI * 0.35);
    pitchCtx.stroke();

    const pitchTexture = new THREE.CanvasTexture(pitchCanvas);
    pitchTexture.wrapS = pitchTexture.wrapT = THREE.RepeatWrapping;
    pitchTexture.repeat.set(1.5, 1.5);

    // 2. 草坪平面
    const pitchGeo = new THREE.PlaneGeometry(RADIUS * 6.5, RADIUS * 6.5);
    const pitchMat = new THREE.MeshStandardMaterial({
      map: pitchTexture,
      roughness: 0.85,
      metalness: 0.02,
      color: 0xffffff,
    });
    const pitchMesh = new THREE.Mesh(pitchGeo, pitchMat);
    pitchMesh.rotation.x = -Math.PI / 2;
    pitchMesh.position.y = -0.02;
    scene.add(pitchMesh);

    // 3. 场地边缘发光边框（像球场灯光照射的白线）
    const fieldBorderGeo = new THREE.EdgesGeometry(
      new THREE.PlaneGeometry(RADIUS * 5.5, RADIUS * 5.5)
    );
    const fieldBorderMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
    });
    const fieldBorder = new THREE.LineSegments(fieldBorderGeo, fieldBorderMat);
    fieldBorder.rotation.x = -Math.PI / 2;
    fieldBorder.position.y = 0.01;
    scene.add(fieldBorder);

    // 台子中心发光圈（演讲台感）
    const stageGeo = new THREE.CylinderGeometry(RADIUS*0.4, RADIUS*0.5, 0.1, 32);
    const stageMat = new THREE.MeshStandardMaterial({
      color: 0x0a1535,
      emissive: 0x1133aa,
      emissiveIntensity: 0.4,
      metalness: 0.8,
      roughness: 0.2,
    });
    const stage = new THREE.Mesh(stageGeo, stageMat);
    stage.position.y = 0.05; scene.add(stage);

    // 地板中心发光圈（保持 floorGlow 引用供动画使用）
    floorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(RADIUS * 1.8, 64),
      new THREE.MeshBasicMaterial({ color:0x2233ff, transparent:true, opacity:.035, side:THREE.DoubleSide })
    );
    floorGlow.rotation.x = -Math.PI/2; floorGlow.position.y = .006;
    floorGlow.userData.isFloorGlow = true;
    scene.add(floorGlow);
  }

  function makeStars() {
    const n = 3000, pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - .5) * 220;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color:0xffffff, size:.1, sizeAttenuation:true })));
    // Colored accent stars
    const nc = 500, cpos = new Float32Array(nc * 3);
    for (let i = 0; i < nc * 3; i++) cpos[i] = (Math.random() - .5) * 150;
    const cgeo = new THREE.BufferGeometry();
    cgeo.setAttribute('position', new THREE.BufferAttribute(cpos, 3));
    scene.add(new THREE.Points(cgeo, new THREE.PointsMaterial({ color:0x4488ff, size:.18, sizeAttenuation:true })));
  }

  function makeFloor() {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(RADIUS * 2.4, 64),
      new THREE.MeshStandardMaterial({ color:0x04041c, metalness:.6, roughness:.4, transparent:true, opacity:.97 })
    );
    disc.rotation.x = -Math.PI/2; disc.position.y = -.02; scene.add(disc);

    const grid = new THREE.GridHelper(RADIUS * 4, 16, 0x1a1a55, 0x0c0c30);
    grid.position.y = -.01; scene.add(grid);

    // Central glow disc
    floorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(RADIUS * 1.8, 64),
      new THREE.MeshBasicMaterial({ color:0x2233ff, transparent:true, opacity:.035, side:THREE.DoubleSide })
    );
    floorGlow.rotation.x = -Math.PI/2; floorGlow.position.y = .005;
    floorGlow.userData.isFloorGlow = true;
    scene.add(floorGlow);

    // Hex floor tiles effect (concentric hex rings using torus at low y)
    [1.2, 2.5, 3.8].forEach((r, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, .012, 4, 6),
        new THREE.MeshBasicMaterial({ color:0x223388, transparent:true, opacity:.12 })
      );
      ring.rotation.x = Math.PI/2; ring.position.y = .02;
      scene.add(ring);
    });
  }

  function makeTableRing() {
    [[.07,1],[.3,.04]].forEach(([t,op]) => {
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(RADIUS, t, 16, 100),
        op === 1
          ? new THREE.MeshStandardMaterial({ color: 0xccddff, emissive: 0x6688cc, emissiveIntensity: 0.4, metalness: 0.5, roughness: 0.3 })
          : new THREE.MeshBasicMaterial({ color:0x4466ff, transparent:true, opacity:op })
      );
      m.rotation.x = Math.PI/2; m.position.y = .07; scene.add(m);
    });
  }

  function makeOuterRing() {
    // Large outer decorative ring
    const outer = new THREE.Mesh(
      new THREE.TorusGeometry(RADIUS * 1.55, .022, 8, 120),
      new THREE.MeshBasicMaterial({ color:0x1a2266, transparent:true, opacity:.35 })
    );
    outer.rotation.x = Math.PI/2; outer.position.y = .03; scene.add(outer);

    // Floating upper ring
    const upper = new THREE.Mesh(
      new THREE.TorusGeometry(RADIUS * 1.2, .018, 8, 80),
      new THREE.MeshBasicMaterial({ color:0x2244aa, transparent:true, opacity:.25 })
    );
    upper.rotation.x = Math.PI/2; upper.position.y = 4; upper.userData.upperRing = true;
    scene.add(upper);
  }

  function makeNameBadge(id, colorHex) {
    const W = 512, H = 128;
    const c = Object.assign(document.createElement('canvas'), {width:W, height:H});
    const ctx = c.getContext('2d');
    const hex = '#' + colorHex.toString(16).padStart(6,'0');
    const NAMES2 = { stat:'Dr.冰狗', mystic:'月影姐', history:'老球迷', gambler:'赌狗本狗', psych:'碎碎念', moderator:'议长' };
    const ICONS2  = { stat:'📊', mystic:'🔮', history:'📜', gambler:'🎰', psych:'🧠', moderator:'⚖️' };

    // 卡片外框（圆角矩形，有立体感边框）
    ctx.clearRect(0, 0, W, H);
    const roundRect = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
      ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
      ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
      ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
      ctx.closePath();
    };

    // 背景：从 agent 色到深色渐变
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, hex + 'ee');
    bg.addColorStop(0.4, hex + '99');
    bg.addColorStop(1, '#000000cc');
    roundRect(4, 4, W-8, H-8, 12);
    ctx.fillStyle = bg; ctx.fill();

    // 边框（双层：亮色外框 + 细内框）
    roundRect(4, 4, W-8, H-8, 12);
    ctx.strokeStyle = hex; ctx.lineWidth = 3; ctx.stroke();
    roundRect(8, 8, W-16, H-16, 10);
    ctx.strokeStyle = '#ffffff44'; ctx.lineWidth = 1; ctx.stroke();

    // 顶部高光条（模拟3D圆角立体感）
    const shine = ctx.createLinearGradient(0, 4, 0, 32);
    shine.addColorStop(0, 'rgba(255,255,255,0.25)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    roundRect(6, 6, W-12, 28, 10);
    ctx.fillStyle = shine; ctx.fill();

    // Emoji 图标（左侧）
    ctx.font = '44px serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.shadowColor = hex; ctx.shadowBlur = 12;
    ctx.fillText(ICONS2[id] || '?', 14, H/2);
    ctx.shadowBlur = 0;

    // 名字（右侧主文字）
    ctx.font = 'bold 36px "PingFang SC","Microsoft YaHei",Arial,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
    ctx.fillText(NAMES2[id] || id, W/2 + 18, H/2 - 4);
    ctx.shadowBlur = 0;

    // 底部小字角色标签
    const TITLES2 = { stat:'数 据 帝', mystic:'玄 学 博 主', history:'历 史 元 老', gambler:'盘 口 派', psych:'心 理 观 察', moderator:'主 播' };
    ctx.font = '16px "PingFang SC","Microsoft YaHei",Arial,sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(TITLES2[id] || '', W/2 + 18, H/2 + 22);

    return new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  }

  function makeThrone(id, idx) {
    const angle = (idx / AGENT_ORDER.length) * Math.PI * 2 - Math.PI * .5;
    const x = Math.cos(angle) * RADIUS, z = Math.sin(angle) * RADIUS;
    const color = COLORS[id];
    const g = new THREE.Group();
    g.position.set(x, 0, z); scene.add(g);

    // Platform
    const hex = new THREE.Mesh(
      new THREE.CylinderGeometry(.72, .72, .14, 6),
      new THREE.MeshStandardMaterial({ color, emissive:color, emissiveIntensity:.2, metalness:.75, roughness:.25 })
    );
    hex.position.y = .07; g.add(hex);

    // Edge ring on platform
    const edgeRing = new THREE.Mesh(
      new THREE.TorusGeometry(.72, .025, 4, 6),
      new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.55 })
    );
    edgeRing.rotation.x = Math.PI/2; edgeRing.position.y = .14; g.add(edgeRing);

    // Pillar
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(.06, .06, 2.1, 8),
      new THREE.MeshStandardMaterial({ color:0x0d0d2a, metalness:.9, roughness:.1 })
    );
    pillar.position.y = 1.2; g.add(pillar);

    // Light beam cone
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(.03, .6, 5, 8, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.05, side:THREE.BackSide })
    );
    beam.position.y = 2.65; g.add(beam);

    // Orbit ring
    const orbRing = new THREE.Mesh(
      new THREE.TorusGeometry(.56, .03, 8, 32),
      new THREE.MeshBasicMaterial({ color })
    );
    orbRing.position.y = 2.0; g.add(orbRing);

    // Secondary orbit ring (perpendicular)
    const orbRing2 = new THREE.Mesh(
      new THREE.TorusGeometry(.42, .015, 8, 24),
      new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.5 })
    );
    orbRing2.position.y = 2.0; g.add(orbRing2);

    // 让人物面朝圆心
    g.rotation.y = -angle + Math.PI;

    // ── 3D 人形角色 ──────────────────────────────────────
    const skinCol = 0xf5d5a8; // 更亮的肤色，在暗场景可见
    // 直接使用 agent 的主色（COLORS[id]），亮度高，配合 emissive 在暗场景中自发光
    const shirtColor = color; // color === COLORS[id]，每个 agent 的鲜亮主色
    const HAIR_COLORS = {
      stat: 0x333355, gambler: 0x111111, history: 0xaaaaaa,
      psych: 0x442211, mystic: 0x330d55, moderator: 0x333300,
    };
    const PANTS_COLORS = {
      stat: 0x0a1845, gambler: 0x062215, history: 0x2a1a08,
      psych: 0x062222, mystic: 0x150830, moderator: 0x1a1400,
    };
    const hairColor  = HAIR_COLORS[id]  || 0x222222;
    const pantsColor = PANTS_COLORS[id] || 0x111122;

    // 材质：shirtColor 同时作为 emissive，角色在暗场景中会发出自身颜色的微光
    const mat = (col, rough=0.75, metal=0.15, emissive=null, emInt=0.28) =>
      new THREE.MeshStandardMaterial({
        color: col, roughness: rough, metalness: metal,
        emissive: emissive ?? col,
        emissiveIntensity: emInt
      });

    // 躯干（U7-A: 增高拉细，改善比例）
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.0, 10), mat(shirtColor, 0.72));
    torso.position.y = 1.5; torso.userData.isTorso = true; g.add(torso);

    // 脖子
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 0.18, 8), mat(skinCol));
    neck.position.y = 2.09; g.add(neck);

    // 头部（U7-A: 缩小头部半径 0.30→0.24）
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), mat(skinCol, 0.88));
    head.position.y = 2.25; g.add(head);
    head.userData.isHead = true;

    // 发型（半球）
    const hairMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.238, 16, 8, 0, Math.PI*2, 0, Math.PI * 0.55),
      mat(hairColor, 1.0)
    );
    hairMesh.position.y = 2.22; g.add(hairMesh);

    // 月影姐长发
    if (id === 'mystic') {
      [-1,1].forEach(dir => {
        const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.025, 0.6, 6), mat(hairColor,1));
        strand.position.set(dir * 0.22, 2.07, 0);
        strand.rotation.z = dir * 0.25;
        g.add(strand);
      });
    }
    // 议长炸毛
    if (id === 'moderator') {
      [-2,-1,0,1,2].forEach(i => {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 5), mat(hairColor, 1));
        spike.position.set(i * 0.08, 2.52, 0);
        spike.rotation.z = i * 0.18;
        g.add(spike);
      });
    }

    // 眼睛（Pixar风：眼白+彩色虹膜+瞳孔+高光）
    const EYE_COLORS = { stat:0x4aabff, mystic:0xcc55ff, history:0xffaa22, gambler:0x00e087, psych:0x00ddcc, moderator:0xf0d060 };
    const irisColor = EYE_COLORS[id] || 0x44aaff;
    const eyeMeshes = [];
    [-0.1, 0.1].forEach(ex => {
      // 眼白（略扁球体）
      const eyeWhite = new THREE.Mesh(
        new THREE.SphereGeometry(0.040, 12, 10),
        new THREE.MeshStandardMaterial({ color:0xf8f8ff, roughness:0.25, metalness:0, emissive:0xf8f8ff, emissiveIntensity:0.04 })
      );
      eyeWhite.position.set(ex, 2.22, 0.183);
      eyeWhite.scale.z = 0.55;
      g.add(eyeWhite);
      eyeMeshes.push(eyeWhite);

      // 虹膜（有颜色）
      const iris = new THREE.Mesh(
        new THREE.CircleGeometry(0.024, 16),
        new THREE.MeshBasicMaterial({ color: irisColor })
      );
      iris.position.set(ex, 2.22, 0.207);
      g.add(iris);

      // 瞳孔
      const pupil = new THREE.Mesh(
        new THREE.CircleGeometry(0.013, 12),
        new THREE.MeshBasicMaterial({ color: 0x040412 })
      );
      pupil.position.set(ex, 2.22, 0.209);
      g.add(pupil);

      // 高光（两个，模拟真实眼神）
      const hi1 = new THREE.Mesh(new THREE.CircleGeometry(0.007, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hi1.position.set(ex + 0.009, 2.232, 0.210);
      g.add(hi1);
      const hi2 = new THREE.Mesh(new THREE.CircleGeometry(0.003, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hi2.position.set(ex - 0.007, 2.212, 0.210);
      g.add(hi2);
    });

    // 眉毛（动画卡通感）
    [-0.1, 0.1].forEach(ex => {
      const brow = new THREE.Mesh(
        new THREE.BoxGeometry(0.058, 0.013, 0.010),
        mat(hairColor, 0.85, 0.05, hairColor, 0.5)
      );
      brow.position.set(ex, 2.268, 0.172);
      brow.rotation.z = ex < 0 ? 0.14 : -0.14;
      g.add(brow);
    });

    // 嘴巴（U7-C: 存入 nodes 用于动画；比 torus 更像嘴形）
    const mouthGroup = new THREE.Group();
    mouthGroup.position.set(0, 2.12, 0.195);
    mouthGroup.rotation.x = -0.10;
    g.add(mouthGroup);
    // 嘴唇下缘弧线
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.009, 6, 14, Math.PI), mat(0x8a3a2e));
    mouthGroup.add(mouth);
    // 嘴唇上缘（略窄）
    const lipTop = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.007, 6, 12, Math.PI), mat(0xcc6655));
    lipTop.rotation.y = Math.PI;
    lipTop.position.y = 0.005;
    mouthGroup.add(lipTop);

    // 冰狗眼镜
    if (id === 'stat') {
      [-0.1, 0.1].forEach(ex => {
        const frame = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.010, 6, 12), mat(color, 0.5, 0.5));
        frame.position.set(ex, 2.22, 0.185);
        frame.rotation.x = Math.PI * 0.5;
        g.add(frame);
      });
    }
    // 碎碎念耳机
    if (id === 'psych') {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.020, 6, 20, Math.PI), mat(color, 0.5, 0.5));
      band.position.set(0, 2.30, 0); band.rotation.z = Math.PI;
      g.add(band);
      [-1,1].forEach(dir => {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.05, 8), mat(color, 0.4, 0.6));
        cup.position.set(dir * 0.26, 2.22, 0); cup.rotation.z = Math.PI/2;
        g.add(cup);
      });
    }
    // 议长麦克风
    if (id === 'moderator') {
      const micGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.35, 6), mat(0xaaaaaa, 0.4, 0.8));
      micGrip.position.set(0.32, 1.13, 0.1); micGrip.rotation.z = 0.4;
      g.add(micGrip);
      const micHead = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mat(0x888888, 0.3, 0.9));
      micHead.position.set(0.40, 1.31, 0.18);
      g.add(micHead);
    }
    // 赌狗扑克牌
    if (id === 'gambler') {
      [-0.05, 0, 0.05].forEach((off, i) => {
        const card3d = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, 0.14), mat(i===1?0xff4444:0xffffff, 0.6));
        card3d.position.set(0.38+off*0.5, 1.13, 0.08+off*0.3);
        card3d.rotation.y = i * 0.2;
        g.add(card3d);
      });
    }
    // U7-B: 月影姐月亮发饰
    if (id === 'mystic') {
      const moon = new THREE.Mesh(
        new THREE.TorusGeometry(0.07, 0.018, 5, 12, Math.PI * 1.4),
        mat(0xf0d060, 0.3, 0.85, 0xf0d060, 0.9)
      );
      moon.position.set(0.08, 2.50, 0.05);
      moon.rotation.set(0.3, 0, Math.PI * 0.15);
      g.add(moon);
    }
    // U7-B: 老球迷围巾
    if (id === 'history') {
      const scarf = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 0.20, 10),
        mat(COLORS[id], 0.9, 0, null, 0.45)
      );
      scarf.position.y = 2.04;
      g.add(scarf);
      // 围巾垂下来的一段
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.38, 0.04),
        mat(COLORS[id], 0.9, 0, null, 0.30)
      );
      tail.position.set(0.04, 1.78, 0.10);
      tail.rotation.z = 0.12;
      g.add(tail);
    }

    // 手臂（U7-A: 随躯干上移 +0.25）
    [-1,1].forEach(dir => {
      const armUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.060, 0.44, 6), mat(shirtColor, 0.85));
      armUpper.position.set(dir * 0.32, 1.40, 0);
      armUpper.rotation.z = dir * 0.32;
      g.add(armUpper);

      const armLower = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.050, 0.40, 6), mat(shirtColor, 0.85));
      armLower.position.set(dir * 0.36, 1.13, 0);
      armLower.rotation.z = dir * 0.22;
      g.add(armLower);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), mat(skinCol));
      hand.position.set(dir * 0.38, 0.95, 0);
      g.add(hand);
    });

    // 腿部
    [-1,1].forEach(dir => {
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.5, 6), mat(pantsColor, 0.9));
      thigh.position.set(dir * 0.12, 0.7, 0);
      g.add(thigh);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.44, 6), mat(pantsColor, 0.9));
      shin.position.set(dir * 0.13, 0.36, 0);
      g.add(shin);

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.2), mat(0x1a1a1a, 0.95));
      foot.position.set(dir * 0.13, 0.14, 0.03);
      g.add(foot);
    });

    // 用 Sprite 仅作为发光标注（放在头顶）
    const sprite = makeNameBadge(id, color);
    sprite.position.y = 2.80; sprite.scale.set(2.2, 0.56, 1);
    g.add(sprite);

    // Point light（从胸部位置）
    const light = new THREE.PointLight(color, .5, 10);
    light.position.y = 1.5; g.add(light);

    nodes[id] = { g, hex, beam, orbRing, orbRing2, sprite, light, pillar, edgeRing, angle, x, z, mouth: mouthGroup, head, eyeMeshes };
  }

  // ── 各 agent 专属广播主播台 ──────────────────────────────────
  function makeBroadcastDesks() {
    AGENT_ORDER.forEach((id, idx) => {
      const angle = (idx / AGENT_ORDER.length) * Math.PI * 2 - Math.PI * .5;
      const r = RADIUS * 0.72; // 比 agent 更靠近圆心
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const color = COLORS[id];

      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = -angle + Math.PI; // 面朝圆心

      // 桌面
      const deskMat = new THREE.MeshStandardMaterial({
        color: 0x060c1a, emissive: color, emissiveIntensity: 0.06,
        metalness: 0.82, roughness: 0.22,
      });
      const desk = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.065, 0.38), deskMat);
      desk.position.y = 1.10;
      g.add(desk);

      // 桌腿（两侧支撑柱）
      [-0.32, 0.32].forEach(ox => {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.48, 0.04),
          new THREE.MeshStandardMaterial({ color: 0x0a0a1e, metalness: 0.92, roughness: 0.15 })
        );
        leg.position.set(ox, 0.83, 0);
        g.add(leg);
      });

      // 前沿 LED 发光条
      const led = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.014, 0.018),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
      );
      led.position.set(0, 1.065, -0.19);
      g.add(led);

      // 桌面顶部微弱彩条（agent主色）
      const topStrip = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.003, 0.36),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 })
      );
      topStrip.position.set(0, 1.134, 0);
      g.add(topStrip);

      // 麦克风立杆
      const micStem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.016, 0.22, 6),
        new THREE.MeshStandardMaterial({ color: 0x1a1a2c, metalness: 0.9, roughness: 0.1 })
      );
      micStem.position.set(0, 1.25, -0.06);
      g.add(micStem);

      const micHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.038, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x222234, metalness: 0.75, roughness: 0.4,
          emissive: color, emissiveIntensity: 0.12 })
      );
      micHead.position.set(0, 1.375, -0.06);
      g.add(micHead);

      // 桌面小屏（显示 agent 颜色）
      const screenGeo = new THREE.BoxGeometry(0.22, 0.01, 0.14);
      const screenMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 });
      const screen = new THREE.Mesh(screenGeo, screenMat);
      screen.position.set(0.28, 1.135, 0);
      g.add(screen);

      scene.add(g);
    });
  }

  function makeCenterFootball() {
    // 足球纹理（canvas 绘制黑白五边形花纹 + FIFA 金边）
    const fbCvs = document.createElement('canvas');
    fbCvs.width = 512; fbCvs.height = 512;
    const fctx = fbCvs.getContext('2d');

    // 白色球体底色
    const bgG = fctx.createRadialGradient(200, 180, 30, 256, 256, 256);
    bgG.addColorStop(0, '#e8efe8'); bgG.addColorStop(1, '#c0cac0');
    fctx.fillStyle = bgG; fctx.fillRect(0, 0, 512, 512);

    // 足球五边形图案（标准32面体投影 6个五边形）
    const penta = (cx, cy, r, rot) => {
      fctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + rot;
        i === 0 ? fctx.moveTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r)
                : fctx.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
      }
      fctx.closePath();
    };
    fctx.fillStyle = '#1a2a1a';
    fctx.strokeStyle = '#0a1a0a';
    fctx.lineWidth = 3;
    [
      [256, 256, 90, 0],
      [256, 100, 62, 0.2],
      [412, 188, 62, 1.3],
      [366, 380, 62, 2.5],
      [146, 380, 62, 3.9],
      [100, 188, 62, -1.3],
    ].forEach(([cx, cy, r, rot]) => {
      penta(cx, cy, r, rot);
      fctx.fill();
      fctx.stroke();
    });

    // 金边光泽（世界杯风格）
    const goldRim = fctx.createRadialGradient(256, 256, 200, 256, 256, 256);
    goldRim.addColorStop(0.8, 'transparent');
    goldRim.addColorStop(1, 'rgba(200,168,50,0.18)');
    fctx.fillStyle = goldRim;
    fctx.beginPath(); fctx.arc(256, 256, 256, 0, Math.PI * 2); fctx.fill();

    const fbTex = new THREE.CanvasTexture(fbCvs);

    // 足球球体
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(.55, 32, 32),
      new THREE.MeshStandardMaterial({
        map: fbTex,
        metalness: 0.05,
        roughness: 0.35,
        emissive: 0x1a2a10,
        emissiveIntensity: 0.15,
      })
    );
    ball.position.y = .7; ball.userData.centerOrb = true; scene.add(ball);

    // 内部点光源（让球发光）
    const ballLight = new THREE.PointLight(0x44ff88, 0.6, 6);
    ballLight.position.y = .7; scene.add(ballLight);
    ballLight.userData.centerBallLight = true;

    // 绿色光晕轨道环（世界杯绿）
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(.84, .030, 8, 56),
      new THREE.MeshBasicMaterial({ color: 0x00d46a, transparent: true, opacity: .65 })
    );
    ring.position.y = .7; ring.userData.centerRing = true; scene.add(ring);

    // 金色倾斜环
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(.72, .020, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xc8a832, transparent: true, opacity: .40 })
    );
    ring2.position.y = .7; ring2.rotation.x = Math.PI / 3; ring2.userData.centerRing2 = true; scene.add(ring2);
  }

  // ── 角色专属剪影纹理 ────────────────────────────────────────
  const SILHOUETTES = {
    stat: (ctx, cx, cy, r, hex) => {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = hex;
      ctx.font = '11px monospace';
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
        ctx.fillText(Math.random() > 0.5 ? '1' : '0', cx - r*0.7 + j*22, cy - r*0.5 + i*20);
      }
      ctx.globalAlpha = 1;
    },
    mystic: (ctx, cx, cy, r, hex) => {
      ctx.globalAlpha = 0.15; ctx.strokeStyle = hex; ctx.lineWidth = 0.8;
      const pts = [[cx-r*.5,cy-r*.3],[cx+r*.3,cy-r*.5],[cx+r*.5,cy+r*.2],[cx-r*.3,cy+r*.4]];
      ctx.beginPath();
      pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.stroke();
      pts.forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1], 2, 0, Math.PI*2); ctx.fillStyle = hex; ctx.fill(); });
      ctx.globalAlpha = 1;
    },
    history: (ctx, cx, cy, r, hex) => {
      ctx.globalAlpha = 0.12; ctx.strokeStyle = hex; ctx.lineWidth = 0.8;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - r*.55, cy - r*.35 + i*14);
        ctx.lineTo(cx + r*.55, cy - r*.35 + i*14);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    gambler: (ctx, cx, cy, r, hex) => {
      ctx.globalAlpha = 0.15; ctx.fillStyle = hex;
      const d = (x, y, s) => { ctx.beginPath(); ctx.moveTo(x, y-s); ctx.lineTo(x+s, y); ctx.lineTo(x, y+s); ctx.lineTo(x-s, y); ctx.closePath(); ctx.fill(); };
      d(cx - r*.4, cy - r*.2, 8); d(cx + r*.4, cy + r*.2, 6);
      ctx.globalAlpha = 1;
    },
    psych: (ctx, cx, cy, r, hex) => {
      ctx.globalAlpha = 0.18; ctx.strokeStyle = hex; ctx.lineWidth = 1;
      ctx.beginPath(); let x = cx - r*.6;
      ctx.moveTo(x, cy);
      for (let i = 0; i <= 24; i++) {
        x = cx - r*.6 + i*(r*1.2/24);
        ctx.lineTo(x, cy + (i%3===1 ? -12 : i%3===2 ? 12 : 0));
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    },
    moderator: (ctx, cx, cy, r, hex) => {
      ctx.globalAlpha = 0.15; ctx.strokeStyle = hex; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy - r*.4); ctx.lineTo(cx, cy + r*.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - r*.4, cy - r*.1); ctx.lineTo(cx + r*.4, cy - r*.1); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx - r*.4, cy + r*.1, 10, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + r*.4, cy + r*.1, 10, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha = 1;
    },
  };

  // ── Agent sprite (canvas texture) ── 人形角色卡风格 ────────
  function makeAgentSprite(id, colorHex) {
    const W = 384, H = 480;
    const c = Object.assign(document.createElement('canvas'), { width:W, height:H });
    const ctx = c.getContext('2d');
    const hex = '#' + colorHex.toString(16).padStart(6, '0');
    const cx = 192;

    // ── 角色配置 ───────────────────────────────────────
    const CHARS = {
      stat: {
        bg1:'#04112e', bg2:'#081d4a',
        shirtColor:'#1a4a9a', hairColor:'#1a1a2e',
        hair:'short', accessory:'glasses',
        label:'数据帝',
      },
      gambler: {
        bg1:'#031a0d', bg2:'#062d18',
        shirtColor:'#1a5c2a', hairColor:'#0d0d0d',
        hair:'slick', accessory:'cards',
        label:'盘口派',
      },
      history: {
        bg1:'#1a1000', bg2:'#2d1a00',
        shirtColor:'#6b4c1a', hairColor:'#888888',
        hair:'old', accessory:'scarf',
        label:'历史区元老',
      },
      psych: {
        bg1:'#031a1a', bg2:'#062d2d',
        shirtColor:'#1a6b6b', hairColor:'#2d1a0a',
        hair:'neat', accessory:'headset',
        label:'心理观察员',
      },
      mystic: {
        bg1:'#0d0520', bg2:'#1a0a35',
        shirtColor:'#4a1a8a', hairColor:'#2a1040',
        hair:'long', accessory:'star',
        label:'玄学博主',
      },
      moderator: {
        bg1:'#1a1000', bg2:'#2d2000',
        shirtColor:'#8a6a00', hairColor:'#1a1a00',
        hair:'spiky', accessory:'mic',
        label:'主播',
      },
    };
    const ch = CHARS[id] || CHARS.stat;

    // ── 背景渐变 ─────────────────────────────────────
    const bgGrd = ctx.createRadialGradient(cx, H*0.4, 20, cx, H*0.4, H*0.7);
    bgGrd.addColorStop(0, ch.bg2); bgGrd.addColorStop(1, ch.bg1);
    ctx.fillStyle = bgGrd; ctx.fillRect(0, 0, W, H);

    // 角色色竖向渐变装饰
    const sideGrd = ctx.createLinearGradient(0, 0, W, 0);
    sideGrd.addColorStop(0, hex+'33'); sideGrd.addColorStop(0.5, hex+'08'); sideGrd.addColorStop(1, hex+'22');
    ctx.fillStyle = sideGrd; ctx.fillRect(0, 0, W, H);

    // ── 人物身体绘制（头+肩+身） ──────────────────────
    const headY = 155, headR = 52;
    const shoulderY = headY + headR + 10;
    const skinColor = id === 'mystic' ? '#d4a8c8' : '#e8c89a';

    // 身体（梯形）
    ctx.beginPath();
    ctx.moveTo(cx - 55, shoulderY);
    ctx.lineTo(cx + 55, shoulderY);
    ctx.lineTo(cx + 70, H * 0.72);
    ctx.lineTo(cx - 70, H * 0.72);
    ctx.closePath();
    const bodyGrd = ctx.createLinearGradient(cx - 55, shoulderY, cx + 55, shoulderY);
    bodyGrd.addColorStop(0, ch.shirtColor + 'dd');
    bodyGrd.addColorStop(0.5, ch.shirtColor);
    bodyGrd.addColorStop(1, ch.shirtColor + 'cc');
    ctx.fillStyle = bodyGrd; ctx.fill();

    // 领口（V领）
    ctx.beginPath();
    ctx.moveTo(cx - 18, shoulderY); ctx.lineTo(cx, shoulderY + 22); ctx.lineTo(cx + 18, shoulderY);
    ctx.strokeStyle = skinColor + '99'; ctx.lineWidth = 2; ctx.stroke();

    // 手臂（左右）
    const armW = 22;
    [[-1], [1]].forEach(([dir]) => {
      ctx.beginPath();
      ctx.moveTo(cx + dir * 50, shoulderY + 5);
      ctx.quadraticCurveTo(cx + dir * 75, shoulderY + 45, cx + dir * 68, shoulderY + 95);
      ctx.lineWidth = armW; ctx.strokeStyle = ch.shirtColor; ctx.lineCap = 'round';
      ctx.stroke();
      // 手
      ctx.beginPath();
      ctx.arc(cx + dir * 66, shoulderY + 100, 12, 0, Math.PI*2);
      ctx.fillStyle = skinColor; ctx.fill();
    });

    // 头部
    ctx.beginPath(); ctx.arc(cx, headY, headR, 0, Math.PI*2);
    const faceGrd = ctx.createRadialGradient(cx - 10, headY - 10, 5, cx, headY, headR);
    faceGrd.addColorStop(0, skinColor);
    faceGrd.addColorStop(1, skinColor + 'cc');
    ctx.fillStyle = faceGrd; ctx.fill();
    // 面部阴影
    ctx.beginPath(); ctx.arc(cx, headY, headR, 0, Math.PI*2);
    ctx.strokeStyle = hex + '44'; ctx.lineWidth = 2; ctx.stroke();

    // ── 发型 ─────────────────────────────────────────
    ctx.fillStyle = ch.hairColor;
    if (ch.hair === 'short') {
      ctx.beginPath(); ctx.ellipse(cx, headY - headR * 0.5, headR * 1.02, headR * 0.65, 0, Math.PI, 0);
      ctx.fill();
    } else if (ch.hair === 'slick') {
      ctx.beginPath(); ctx.ellipse(cx + 8, headY - headR * 0.55, headR * 0.95, headR * 0.6, -0.2, Math.PI, 0);
      ctx.fill();
      // 油光效果
      ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 10, headY - headR * 0.9); ctx.quadraticCurveTo(cx + 20, headY - headR * 0.7, cx + 30, headY - headR * 0.3); ctx.stroke();
    } else if (ch.hair === 'old') {
      ctx.beginPath(); ctx.ellipse(cx, headY - headR * 0.5, headR * 1.05, headR * 0.6, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#aaaaaa';
      ctx.beginPath(); ctx.ellipse(cx, headY - headR * 0.52, headR * 0.98, headR * 0.55, 0, Math.PI, 0);
      ctx.fill();
    } else if (ch.hair === 'long') {
      // 长发（月影姐）
      ctx.beginPath(); ctx.ellipse(cx, headY - headR * 0.5, headR * 1.05, headR * 0.65, 0, Math.PI, 0);
      ctx.fill();
      // 垂下的长发
      ctx.beginPath(); ctx.moveTo(cx - headR, headY + 10);
      ctx.quadraticCurveTo(cx - headR * 1.3, headY + 60, cx - headR * 1.1, shoulderY + 30);
      ctx.lineWidth = 18; ctx.strokeStyle = ch.hairColor; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + headR, headY + 10);
      ctx.quadraticCurveTo(cx + headR * 1.3, headY + 60, cx + headR * 1.1, shoulderY + 30);
      ctx.stroke();
    } else if (ch.hair === 'spiky') {
      // 炸毛（议长，活力感）
      ctx.beginPath(); ctx.ellipse(cx, headY - headR * 0.5, headR * 1.02, headR * 0.62, 0, Math.PI, 0);
      ctx.fill();
      // 刺刺的发尖
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * 18, headY - headR * 0.9);
        ctx.lineTo(cx + i * 22 + (i>0?8:-8), headY - headR * 1.45);
        ctx.lineTo(cx + i * 14, headY - headR * 1.0);
        ctx.fillStyle = ch.hairColor; ctx.fill();
      }
    } else { // neat
      ctx.beginPath(); ctx.ellipse(cx, headY - headR * 0.5, headR * 1.02, headR * 0.62, 0, Math.PI, 0);
      ctx.fill();
    }

    // ── 面部特征 ─────────────────────────────────────
    // 眼睛
    const eyeY = headY - 5, eyeGap = 18;
    ctx.fillStyle = '#1a1a2a';
    ctx.beginPath(); ctx.ellipse(cx - eyeGap, eyeY, 7, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + eyeGap, eyeY, 7, 5, 0, 0, Math.PI*2); ctx.fill();
    // 眼白高光
    ctx.fillStyle = '#ffffff88';
    ctx.beginPath(); ctx.arc(cx - eyeGap + 2, eyeY - 2, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + eyeGap + 2, eyeY - 2, 2.5, 0, Math.PI*2); ctx.fill();

    // 嘴型（根据性格）
    ctx.strokeStyle = '#8a5a3a';
    ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath();
    if (id === 'gambler') {
      ctx.arc(cx, headY + 18, 10, 0, Math.PI); // 自信笑
    } else if (id === 'mystic') {
      ctx.arc(cx, headY + 22, 8, 0, Math.PI); // 神秘微笑
    } else if (id === 'psych') {
      ctx.moveTo(cx - 8, headY + 22); ctx.lineTo(cx + 8, headY + 22); // 中性
    } else {
      ctx.arc(cx, headY + 20, 9, 0.1, Math.PI - 0.1); // 普通
    }
    ctx.stroke();

    // ── 配件 ─────────────────────────────────────────
    if (ch.accessory === 'glasses') {
      ctx.strokeStyle = hex; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx - eyeGap, eyeY, 10, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + eyeGap, eyeY, 10, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - eyeGap + 10, eyeY); ctx.lineTo(cx + eyeGap - 10, eyeY); ctx.stroke();
    } else if (ch.accessory === 'headset') {
      ctx.strokeStyle = hex + 'cc'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(cx, headY - headR * 0.2, headR * 1.1, Math.PI * 1.1, 0, false); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx - headR * 1.1, headY, 8, 0, Math.PI*2); ctx.fillStyle = hex; ctx.fill();
      ctx.beginPath(); ctx.arc(cx + headR * 1.1, headY, 8, 0, Math.PI*2); ctx.fill();
    } else if (ch.accessory === 'mic') {
      // 麦克风（在手里）
      ctx.fillStyle = '#aaaaaa';
      ctx.beginPath(); ctx.ellipse(cx + 66, shoulderY + 90, 8, 12, -0.3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.rect(cx + 60, shoulderY + 102, 4, 18); ctx.fillStyle = '#888'; ctx.fill();
    } else if (ch.accessory === 'cards') {
      // 扑克牌扇形
      for (let i = -1; i <= 1; i++) {
        ctx.save(); ctx.translate(cx + 66, shoulderY + 88); ctx.rotate(i * 0.25);
        ctx.fillStyle = i===1 ? '#ff4444' : '#ffffff';
        ctx.fillRect(-7, -12, 14, 18);
        ctx.strokeStyle = '#333'; ctx.lineWidth = 0.5; ctx.strokeRect(-7, -12, 14, 18);
        ctx.restore();
      }
    } else if (ch.accessory === 'star') {
      // 星形发光
      ctx.fillStyle = '#ffdd44'; ctx.shadowColor = '#ffdd44'; ctx.shadowBlur = 8;
      ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('✦', cx + 58, shoulderY + 12);
      ctx.shadowBlur = 0;
    } else if (ch.accessory === 'scarf') {
      // 围巾
      ctx.beginPath();
      ctx.moveTo(cx - 30, shoulderY + 8);
      ctx.quadraticCurveTo(cx, shoulderY + 15, cx + 30, shoulderY + 8);
      ctx.lineWidth = 8; ctx.strokeStyle = hex + 'bb'; ctx.lineCap = 'round'; ctx.stroke();
    }

    // ── 底部 Logo 条 ─────────────────────────────────
    const npY = H * 0.76;
    const npGrd = ctx.createLinearGradient(30, npY, W-30, npY+50);
    npGrd.addColorStop(0, hex+'22'); npGrd.addColorStop(0.5, hex+'44'); npGrd.addColorStop(1, hex+'22');
    ctx.fillStyle = npGrd;
    ctx.beginPath(); ctx.roundRect(30, npY, W-60, 44, 4); ctx.fill();
    ctx.strokeStyle = hex+'66'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(30, npY, W-60, 44, 4); ctx.stroke();

    const NAMES_MAP = { stat:'Dr.冰狗', mystic:'月影姐', history:'老球迷', gambler:'赌狗本狗', psych:'碎碎念', moderator:'议长' };
    ctx.font = 'bold 22px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.shadowColor = hex; ctx.shadowBlur = 8;
    ctx.fillText(NAMES_MAP[id] || id, cx, npY + 16);
    ctx.shadowBlur = 0;

    ctx.font = '14px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = hex + 'cc';
    ctx.fillText(ch.label, cx, npY + 34);

    // 外框（六边形）
    const hexPath = (cxx, cyy, r, rot=0) => {
      ctx.beginPath();
      for (let i=0; i<6; i++) { const a=(i/6)*Math.PI*2+rot; i?ctx.lineTo(cxx+Math.cos(a)*r, cyy+Math.sin(a)*r):ctx.moveTo(cxx+Math.cos(a)*r, cyy+Math.sin(a)*r); }
      ctx.closePath();
    };
    hexPath(cx, H*0.42, H*0.46, Math.PI/6);
    ctx.strokeStyle = hex + '44'; ctx.lineWidth = 2; ctx.stroke();

    return new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  }

  // ── Energy arc from center to speaking agent ─────────────
  function setEnergyArc(id) {
    clearEnergyArc();
    if (!id) return;
    const n = nodes[id]; if (!n) return;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.65, 0),
      new THREE.Vector3(n.x * .45, 5.2, n.z * .45),
      new THREE.Vector3(n.x * .92, 2.0, n.z * .92)
    );
    const pts = curve.getPoints(70);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    energyArc = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: COLORS[id], transparent: true, opacity: .75, linewidth: 2
    }));
    scene.add(energyArc);
  }
  function clearEnergyArc() {
    if (energyArc) { scene.remove(energyArc); energyArc.geometry.dispose(); energyArc.material.dispose(); energyArc = null; }
  }

  // ── Ground halo under speaking agent ─────────────────────
  function setSpeakingHalo(id) {
    clearSpeakingHalo();
    if (!id) return;
    const n = nodes[id]; if (!n) return;
    speakingHalo = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 32),
      new THREE.MeshBasicMaterial({ color: COLORS[id], transparent: true, opacity: .12, side: THREE.DoubleSide })
    );
    speakingHalo.position.set(n.x, 0.01, n.z);
    speakingHalo.rotation.x = -Math.PI/2;
    speakingHalo.userData.isSpeakingHalo = true;
    scene.add(speakingHalo);
  }
  function clearSpeakingHalo() {
    if (speakingHalo) { scene.remove(speakingHalo); speakingHalo.geometry.dispose(); speakingHalo.material.dispose(); speakingHalo = null; }
  }

  // ── State setters ────────────────────────────────────────
  // 相机偏置：始终从 agent 外侧拍摄。朝向中心偏移 = agent 位置的反方向。
  function _camOffset(nx, nz, dist, elevY, pullBack) {
    const len = Math.sqrt(nx*nx + nz*nz) || 1;
    const scale = dist / RADIUS;
    // 沿 agent 方向拉出相机，再反向偏移 pullBack 保证永远在外圈
    return {
      cx: nx * scale,
      cy: elevY,
      cz: nz * scale - (nz / len) * pullBack,
    };
  }

  function setAgentSpeaking(id, moveCam) {
    orbitPaused = true;
    currentSpeakerId = id;
    const n = nodes[id]; if (!n) return;
    // 降低效果强度，减少突兀感
    n.light.intensity = 3.5; n.light.distance = 18;
    n.sprite.scale.setScalar(2.5);
    if (n.hex) { n.hex.material.emissiveIntensity = 1.0; }
    // F6: 发言时光束加强
    if (n.beam) { n.beam.material.opacity = .28; }
    // F12: 音波扩散动画
    spawnSoundWave(id);
    setEnergyArc(id);
    setSpeakingHalo(id);
    AGENT_ORDER.forEach(o => { if (o !== id) _dim(o, true); });
    // 仅在需要移动摄像机时才切换视角（reaction 不移动，避免来回跳）
    if (moveCam !== false) {
      // F2: 发言时摄像机拉近（9→7），更能看清 agent 面部
      const SAFE_Y = 4.8;
      const horizOff = -n.x * 0.55;
      const camZ = Math.max(7, 11 - Math.abs(horizOff) * 0.2);
      camState.pos.set(horizOff, SAFE_Y, camZ);
      camState.look.set(n.x * 0.4, 2.2, n.z * 0.25);
      camLerp = 0.07;
    }
    spawnBurst(id);
  }

  // 仅高亮节点，不移动摄像机（用于 reaction phase）
  function setAgentHighlight(id) {
    setAgentSpeaking(id, false);
  }

  function setAgentThinking(id) {
    orbitPaused = true;
    currentSpeakerId = id;
    const n = nodes[id]; if (!n) return;
    // 只做节点脉冲，不移动摄像机——避免和 feed 内容时序错位
    n.light.intensity = 1.6; n.light.distance = 12;
    n.sprite.scale.setScalar(1.95);
    n.hex.material.emissiveIntensity = .5;
    n.beam.material.opacity = .08;
    clearEnergyArc(); clearSpeakingHalo();
    AGENT_ORDER.forEach(o => { if (o !== id) _dim(o, false); });
    // 摄像机保持当前位置不动
  }

  function _dim(id, heavy) {
    const n = nodes[id]; if (!n) return;
    // 提高暗化底限，减少明暗跳变的突兀感
    n.light.intensity = heavy ? .18 : .3;
    n.sprite.scale.setScalar(heavy ? .8 : 1.0);
    n.hex.material.emissiveIntensity = heavy ? .08 : .14;
    n.beam.material.opacity = heavy ? .03 : .055;
  }

  // F8: pivot 立场转向时，给 agent 的光束和 hex 发出一次"颜色闪烁"效果
  const PICK_COLORS = { home: 0x2266ee, draw: 0xc8a832, away: 0xee2233 };
  function flashPivotColor(id, newPick) {
    const n = nodes[id]; if (!n) return;
    const pc = PICK_COLORS[newPick] || COLORS[id];
    // 短暂把 light 颜色切换到立场色，2s 后恢复
    n.light.color.setHex(pc);
    setTimeout(() => { if (n.light) n.light.color.setHex(COLORS[id]); }, 2000);
    spawnSoundWave(id);
    spawnBurst(id);
  }

  function resetAll() {
    currentSpeakerId = null;
    AGENT_ORDER.forEach(id => {
      const n = nodes[id]; if (!n) return;
      n.light.intensity = .5; n.light.distance = 10;
      n.light.color.setHex(COLORS[id]);
      n.sprite.scale.setScalar(2.2);
      n.hex.material.emissiveIntensity = .2;
      n.beam.material.opacity = .055;
    });
    // F2: 默认摄像机拉近（18→13）让 agent 更大
    camState.pos.set(0, 4.0, 13);
    camState.look.set(0, 2.0, 0);
    camLerp = 0.048;
    clearEnergyArc();
    clearSpeakingHalo();
    orbitPaused = false;
    camLerp = 0.028;
  }

  // ── Particle bursts ──────────────────────────────────────
  // F12: 音波扩散圆环（发言时从 agent 位置向外扩散）
  const soundWaves = [];
  function spawnSoundWave(id) {
    const n = nodes[id]; if (!n) return;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.025, 6, 32),
      new THREE.MeshBasicMaterial({ color: COLORS[id], transparent: true, opacity: 0.7 })
    );
    ring.position.set(n.x, 1.6, n.z);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    soundWaves.push({ ring, life: 1.0, speed: 1.8 });
  }
  function tickSoundWaves(dt) {
    for (let i = soundWaves.length - 1; i >= 0; i--) {
      const w = soundWaves[i];
      w.life -= dt * 1.1;
      if (w.life <= 0) { scene.remove(w.ring); w.ring.geometry.dispose(); w.ring.material.dispose(); soundWaves.splice(i, 1); continue; }
      w.ring.scale.setScalar(1 + (1 - w.life) * w.speed * 3);
      w.ring.material.opacity = Math.max(0, w.life * 0.7);
    }
  }

  // F7: 中央能量光圈（空闲时）
  const energyRings = [];
  let energyRingTimer = 0;
  function spawnEnergyRing() {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.02, 6, 32),
      new THREE.MeshBasicMaterial({ color: 0xc8a832, transparent: true, opacity: 0.5 })
    );
    ring.position.set(0, 0.15, 0);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    energyRings.push({ ring, life: 1.0 });
  }
  function tickEnergyRings(dt) {
    energyRingTimer += dt;
    if (!currentSpeakerId && energyRingTimer > 1.4) {
      energyRingTimer = 0;
      spawnEnergyRing();
    }
    for (let i = energyRings.length - 1; i >= 0; i--) {
      const e = energyRings[i];
      e.life -= dt * 0.5;
      if (e.life <= 0) { scene.remove(e.ring); e.ring.geometry.dispose(); e.ring.material.dispose(); energyRings.splice(i, 1); continue; }
      e.ring.scale.setScalar(1 + (1 - e.life) * 6);
      e.ring.material.opacity = Math.max(0, e.life * 0.45);
    }
  }

  function spawnBurst(id) {
    const n = nodes[id]; if (!n) return;
    const cnt = 80, pos = new Float32Array(cnt*3), vel = [];
    for (let i=0;i<cnt;i++) {
      pos[i*3]=n.x; pos[i*3+1]=1.9; pos[i*3+2]=n.z;
      vel.push({ x:(Math.random()-.5)*.28, y:Math.random()*.22+.06, z:(Math.random()-.5)*.28 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color:COLORS[id], size:.22, transparent:true, opacity:1 }));
    scene.add(pts);
    bursts.push({ pts, vel, life:1, pos });
  }

  function tickBursts(dt) {
    for (let i=bursts.length-1;i>=0;i--) {
      const b=bursts[i];
      b.life -= dt*.6;
      if (b.life<=0){scene.remove(b.pts);b.pts.geometry.dispose();b.pts.material.dispose();bursts.splice(i,1);continue;}
      b.pts.material.opacity = Math.max(0,b.life);
      for(let j=0;j<b.vel.length;j++){
        b.pos[j*3]+=b.vel[j].x; b.pos[j*3+1]+=b.vel[j].y; b.pos[j*3+2]+=b.vel[j].z;
        b.vel[j].y-=.006;
      }
      b.pts.geometry.attributes.position.needsUpdate=true;
    }
  }

  // ── Animation loop ───────────────────────────────────────
  function loop(time) {
    requestAnimationFrame(loop);
    const dt = Math.min((time-prevTime)/1000,.05); prevTime=time;
    const t = time/1000;

    // 3D 角色呼吸/发言动画
    Object.entries(nodes).forEach(([id, n]) => {
      const isSpeak = id === currentSpeakerId;
      // U7-D: 非发言时轻微浮动（idle breathing）
      const bobY = isSpeak ? 0 : Math.sin(t * 0.8 + n.angle) * 0.02;
      if (n.g) n.g.position.y = bobY;

      // 发言时躯干微微前倾
      n.g.children.forEach(child => {
        if (child.userData?.isTorso) {
          child.rotation.x = isSpeak ? Math.sin(t * 3) * 0.04 : 0;
        }
      });

      // 头部动画：发言时点头/转头，idle 时轻微随机晃动
      if (n.head) {
        n.head.rotation.y = isSpeak
          ? Math.sin(t * 2.2) * 0.09
          : Math.sin(t * 0.35 + n.angle * 1.7) * 0.015;
        n.head.rotation.x = isSpeak
          ? Math.sin(t * 2.9 + 0.6) * 0.05
          : 0;
      }

      // U7-C: 嘴部动画——发言时张合
      if (n.mouth) {
        n.mouth.scale.y = isSpeak ? 1 + Math.abs(Math.sin(t * 7)) * 1.2 : 1;
      }

      // 眨眼动画：每 4~6 秒眨一次，各 agent 错开
      if (n.eyeMeshes) {
        const blinkCycle = (t + n.angle * 1.3) % 5.5;
        const blinkSY = blinkCycle > 5.1 ? Math.max(0.05, 1 - (blinkCycle - 5.1) * 12) : 1;
        n.eyeMeshes.forEach(e => { e.scale.y = blinkSY; });
      }
    });

    // Orbit rings
    Object.values(nodes).forEach(n => {
      n.orbRing.rotation.z  += dt*1.1;
      n.orbRing.rotation.x   = Math.sin(t*.6+n.angle)*.38;
      n.orbRing2.rotation.y += dt*1.8;
      n.orbRing2.rotation.x  = Math.cos(t*.5+n.angle)*.5;
    });

    // Center objects
    scene.children.forEach(c => {
      if (c.userData.centerOrb)  {
        c.rotation.y += dt * .35;
        c.rotation.z  = Math.sin(t * .2) * .12; // 轻微摇摆（足球弧线感）
      }
      if (c.userData.centerBallLight) {
        c.intensity = 0.5 + Math.sin(t * 1.8) * 0.2;
      }
      if (c.userData.centerCore) { c.rotation.y-=dt*.6; c.rotation.x+=dt*.2; }
      if (c.userData.centerRing) { c.rotation.x=t*.5; c.rotation.z=t*.28; }
      if (c.userData.centerRing2){ c.rotation.y+=dt*.5; }
      if (c.userData.upperRing)  { c.rotation.z += dt * .22; }
    });

    // Energy arc pulse
    if (energyArc) {
      energyArc.material.opacity = .5 + Math.sin(t * 3.5) * .25;
    }
    // Speaking halo pulse
    if (speakingHalo) {
      speakingHalo.material.opacity = .07 + Math.sin(t * 2.2) * .05;
      const s = 1 + Math.sin(t * 1.6) * .06;
      speakingHalo.scale.set(s, 1, s);
    }
    // Floor glow pulse when someone is speaking
    if (floorGlow) {
      floorGlow.material.opacity = currentSpeakerId
        ? .04 + Math.sin(t * 1.5) * .025
        : .032;
    }

    // 广播轨道镜头：无人发言时缓慢环绕议事厅
    if (!orbitPaused) {
      orbitAngle += dt * 0.12; // 极慢环绕，约52秒一圈
      const r = 16.5, h = 5.2;
      camState.pos.set(Math.sin(orbitAngle) * r, h, Math.cos(orbitAngle) * r);
      camState.look.set(0, 2.0, 0);
      camLerp = 0.028; // 非常平滑
    }

    if (camLerp > 0.048 && orbitPaused) camLerp = Math.max(0.048, camLerp * .97);

    camCurPos.lerp(camState.pos, camLerp);
    camCurLook.lerp(camState.look, camLerp + .006);
    camera.position.copy(camCurPos);
    camera.lookAt(camCurLook);

    tickBursts(dt);
    tickSoundWaves(dt);   // F12 音波
    tickEnergyRings(dt);  // F7 能量光圈
    renderer.render(scene, camera);
  }

  function updateStatsDisplay(home, away, homeP, drawP, awayP) {
    if (!statsBoardCtx || !statsBoardTex) return;
    statsBoardHome = home || statsBoardHome;
    statsBoardAway = away || statsBoardAway;
    drawStatsBoard(statsBoardCtx, statsBoardHome, statsBoardAway,
      Math.round(homeP), Math.round(drawP), Math.round(awayP));
    statsBoardTex.needsUpdate = true;
  }

  return { init, setAgentSpeaking, setAgentHighlight, setAgentThinking, resetAll, updateStatsDisplay, loadPlayerBanners, flashPivotColor };
})();
