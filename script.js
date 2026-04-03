const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
document.body.appendChild(canvas);
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.backgroundColor = 'black';

// --- FEEDBACK & MULTIPLIER STATE ---
let feedback = { text: "", alpha: 0, y: 0, isMiss: false };
let multiplier = 1;

const style = document.createElement('style');
style.innerHTML = `
  .custom-slider {
    -webkit-appearance: none; height: 14px; background: #444; border: 1px solid #777; border-radius: 20px; outline: none; position: absolute; transform: translateX(-50%);
  }
  .custom-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none; width: 22px; height: 22px; background: white; border-radius: 50%; cursor: pointer; border: 2px solid #777;
  }
  .slider-label { position: absolute; color: white; font-family: Arial, sans-serif; font-size: 14px; transform: translateX(-50%); pointer-events: none; opacity: 0; transition: opacity 0.3s; }
  .slider-subtext { position: absolute; color: #888; font-family: Arial, sans-serif; font-size: 11px; transform: translateX(-50%); text-transform: uppercase; letter-spacing: 1px; }
`;
document.head.appendChild(style);

const createStyledSlider = (min, max, val, xPos, yPos, labelText, subtext, width = "130px", isTopRight = false) => {
    const s = document.createElement('input');
    s.type = 'range'; s.min = min; s.max = max; s.value = val;
    s.className = 'custom-slider'; s.style.width = width;
    if(isTopRight) { s.style.right = xPos; s.style.top = yPos; s.style.transform = 'none'; } 
    else { s.style.left = xPos; s.style.bottom = yPos; }
    const l = document.createElement('div');
    l.className = 'slider-label';
    if(isTopRight) { l.style.right = xPos; l.style.top = "50px"; l.style.transform = 'none'; } 
    else { l.style.left = xPos; l.style.bottom = "85px"; }
    const sub = document.createElement('div');
    sub.className = 'slider-subtext';
    if(isTopRight) { sub.style.right = xPos; sub.style.top = "45px"; sub.style.transform = 'none'; } 
    else { sub.style.left = xPos; sub.style.bottom = "25px"; }
    sub.innerText = subtext;
    s.oninput = () => {
        let displayVal = s.value;
        if(subtext === "Direction") displayVal = s.value == 0 ? "Outside" : "Inside";
        if(subtext === "Hard Mode") displayVal = s.value == 1 ? "ON" : "OFF";
        l.innerText = `${labelText}: ${displayVal}`;
        l.style.opacity = '1';
        if (s.fadeTimeout) clearTimeout(s.fadeTimeout);
        s.fadeTimeout = setTimeout(() => { l.style.opacity = '0'; }, 800);
    };
    document.body.appendChild(s); document.body.appendChild(l); document.body.appendChild(sub);
    return s;
};

const sideSlider = createStyledSlider('3', '26', '3', 'calc(50% - 160px)', '50px', "Sides", "Vertices");
const dirSlider = createStyledSlider('0', '1', '0', '50%', '50px', "Mode", "Direction", "80px");
const speedSlider = createStyledSlider('1', '10', '2', 'calc(50% + 160px)', '50px', "Speed", "Projectile Speed");
const hardSlider = createStyledSlider('0', '1', '0', '20px', '20px', "Challenge", "Hard Mode", "100px", true);

let width, height, score = 0, particles = [], notes = [], targets = [];
let activeSides = 3, missFlash = 0, titleAlpha = 1, scoreY = 80, hasStarted = false;
let viewRotation = 0, viewOffset = { x: 0, y: 0 };
const QWERTY = "qwertyuiopasdfghjklzxcvbnm".split("");

let audioCtx = null;
function playTone(freq, isMiss = false) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isMiss ? 40 : freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(isMiss ? 0.05 : 0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.3);
}

window.onresize = () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    updateTargetPoints();
};

function updateTargetPoints() {
    targets = [];
    activeSides = parseInt(sideSlider.value);
    const radius = Math.min(width, height) * 0.35;
    for (let i = 0; i < activeSides; i++) {
        const angle = (i / activeSides) * (Math.PI * 2) - Math.PI / 2;
        targets.push({
            x: width/2 + Math.cos(angle) * radius,
            y: height/2 + Math.sin(angle) * radius,
            key: QWERTY[i],
            color: `hsl(${(i / activeSides) * 360}, 80%, 60%)`,
            freq: 150 + (i * 20),
            shift: 0
        });
    }
}
sideSlider.addEventListener('input', updateTargetPoints);
window.onresize();

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 15;
        this.vy = (Math.random() - 0.5) * 15;
        this.alpha = 1; this.color = color;
    }
    update() { this.x += this.vx; this.y += this.vy; this.alpha *= 0.92; }
    draw() {
        ctx.strokeStyle = hardSlider.value == 1 ? `rgba(100, 100, 100, ${this.alpha})` : this.color.replace('hsl', 'hsla').replace(')', `, ${this.alpha})`);
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, 2, 0, Math.PI * 2); ctx.stroke();
    }
}

class Note {
    constructor() {
        const t = targets[Math.floor(Math.random() * targets.length)];
        this.key = t.key; this.color = t.color; this.tx = t.x; this.ty = t.y;
        this.alpha = 1;
        const bSpeed = parseFloat(speedSlider.value);
        this.speed = (bSpeed + Math.random() * 2) + (Math.floor(score / 500) * 0.5);
        if (dirSlider.value == "1") { this.x = width / 2; this.y = height / 2; }
        else {
            const angle = Math.random() * Math.PI * 2;
            this.x = this.tx + Math.cos(angle) * (width * 0.5);
            this.y = this.ty + Math.sin(angle) * (height * 0.5);
        }
    }
    // --- UPDATED TO PREVENT STICKING ---
    update() {
        const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
        
        // If projectile is about to overshoot or hit target, remove and count as miss
        if (d < this.speed) {
            this.alpha = 0; 
            score = Math.max(0, score - 20); 
            multiplier = 1; 
            missFlash = 1.0; 
            feedback = { text: "miss!", alpha: 1, y: 40, isMiss: true };
            playTone(0, true); 
        } else {
            this.x += (dx / d) * this.speed;
            this.y += (dy / d) * this.speed;
        }
    }
    draw() {
        ctx.strokeStyle = hardSlider.value == 1 ? '#444' : this.color; 
        ctx.globalAlpha = this.alpha; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(this.x, this.y, 8, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
}

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    const target = targets.find(t => t.key === key);
    if (!target) return;
    hasStarted = true; 
    let hitFound = false;
    notes.forEach(n => {
        if (n.key === key && n.alpha > 0) {
            const d = Math.hypot(n.x - n.tx, n.y - n.ty);
            if (d < 45) {
                hitFound = true; 
                score += (10 * multiplier); 
                multiplier += 1;
                n.alpha = 0;
                feedback = { text: "hit!", alpha: 1, y: 60, isMiss: false };
                playTone(target.freq); target.shift = 20;
                const angle = Math.atan2(target.y - height/2, target.x - width/2);
                viewOffset.x = Math.cos(angle) * 10; viewOffset.y = Math.sin(angle) * 10;
                viewRotation = (Math.random() - 0.5) * 0.05;
                for(let i=0; i<12; i++) particles.push(new Particle(n.x, n.y, n.color));
            }
        }
    });
    if (!hitFound) { 
        score = Math.max(0, score - 20); multiplier = 1; missFlash = 1.0; 
        feedback = { text: "miss!", alpha: 1, y: 40, isMiss: true };
        playTone(0, true); 
    }
});

function animate() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);
    
    // --- ARCADE STYLE FEEDBACK ---
    if (feedback.alpha > 0) {
        ctx.save();
        ctx.textAlign = 'left';
        ctx.font = '900 48px sans-serif'; 
        ctx.shadowBlur = 15;
        if (feedback.isMiss) {
            ctx.shadowColor = "rgba(255, 0, 0, 0.8)";
            ctx.fillStyle = `rgba(180, 0, 0, ${feedback.alpha})`;
            feedback.y += 0.5;
        } else {
            ctx.shadowColor = "rgba(0, 255, 255, 0.8)";
            ctx.fillStyle = `rgba(0, 180, 255, ${feedback.alpha})`;
            feedback.y -= 0.5;
        }
        ctx.fillText(feedback.text, 30, feedback.y);
        feedback.alpha -= 0.02;
        ctx.restore();
    }

    if (hasStarted) { titleAlpha = Math.max(0, titleAlpha - 0.05); scoreY = Math.max(45, scoreY - 2); }
    ctx.textAlign = 'center';
    if (titleAlpha > 0) { ctx.fillStyle = `rgba(255, 255, 255, ${titleAlpha})`; ctx.font = '30px Arial'; ctx.fillText('The QWERTY Instrument', width / 2, 60); }
    
    ctx.fillStyle = 'white'; ctx.font = '20px Arial';
    ctx.fillText(`Score: ${score}`, width / 2, scoreY);
    if (multiplier > 1) {
        ctx.fillStyle = 'yellow';
        ctx.fillText(`x${multiplier}`, width / 2 + 80, scoreY);
    }

    ctx.save();
    ctx.translate(width/2 + viewOffset.x, height/2 + viewOffset.y);
    ctx.rotate(viewRotation);
    ctx.translate(-width/2, -height/2);
    viewOffset.x *= 0.85; viewOffset.y *= 0.85; viewRotation *= 0.85;

    const sRate = (parseFloat(speedSlider.value) * 0.01) + (activeSides * 0.003) + (Math.floor(score / 500) * 0.005);
    if (Math.random() < sRate) notes.push(new Note());

    ctx.beginPath(); ctx.lineJoin = 'round';
    targets.forEach((t, i) => {
        t.shift *= 0.85;
        const dx = t.x - width/2, dy = t.y - height/2, d = Math.hypot(dx, dy);
        const vx = t.x + (dx/d)*t.shift, vy = t.y + (dy/d)*t.shift;
        if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
        ctx.fillStyle = hardSlider.value == 1 ? '#666' : t.color; 
        ctx.font = 'bold 14px Arial'; ctx.fillText(t.key.toUpperCase(), vx + (dx/d)*25, vy + (dy/d)*25);
    });
    ctx.closePath();

    if (missFlash > 0) {
        const r = 255, g = 255 * (1 - missFlash) + 50 * missFlash, b = 255 * (1 - missFlash) + 50 * missFlash;
        ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`; ctx.lineWidth = 2 + (missFlash * 3); missFlash *= 0.85; 
    } else {
        ctx.strokeStyle = hardSlider.value == 1 ? '#444' : 'white'; ctx.lineWidth = 2;
    }
    ctx.stroke();

    notes = notes.filter(n => n.alpha > 0);
    notes.forEach(n => { n.update(); n.draw(); });
    particles = particles.filter(p => p.alpha > 0.01);
    particles.forEach(p => { p.update(); p.draw(); });
    ctx.restore();
    requestAnimationFrame(animate);
}
animate();


