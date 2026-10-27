(() => {
  'use strict';

  const input = document.getElementById('guess-input');
  const dropdown = document.getElementById('dropdown');
  const rowsEl = document.getElementById('rows');
  const statusEl = document.getElementById('status');
  const hintEls = document.querySelectorAll('.hint');

  let heroes = [];
  let secret = null;
  let guessed = new Set();
  let matches = [];
  let activeIndex = -1;
  let gameOver = false;

  /* ---------- Load data ---------- */
  async function init() {
    try {
      const res = await fetch('heroes.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      heroes = await res.json();
      if (!Array.isArray(heroes) || !heroes.length) throw new Error('Empty hero list');
    } catch (err) {
      setStatus('Could not load heroes.json. Serve this folder with a local web server (e.g. "python -m http.server").', 'error');
      console.error(err);
      return;
    }
    secret = heroes[Math.floor(Math.random() * heroes.length)];
    refreshHints();
    input.disabled = false;
    input.focus();
    setStatus('Guess a hero to begin.');
  }

  /* ---------- Hints (unlock after a number of guesses) ---------- */
  const HINT_UNLOCKS = { quote: 3, roleSpecies: 5, origin: 7 }; // edit these numbers

  function revealHint(el) {
    if (!secret || el.classList.contains('revealed')) return;
    const type = el.dataset.hint;
    let text = '';
    if (type === 'quote') text = '\u201c' + secret.quote + '\u201d';
    else if (type === 'roleSpecies') text = secret.role + ' \u00b7 ' + secret.species;
    else if (type === 'origin') text = secret.origin;
    el.querySelector('.hint-body').textContent = text;
    el.classList.remove('locked', 'ready');
    el.classList.add('revealed');
    el.setAttribute('aria-disabled', 'false');
  }

  function refreshHints() {
    hintEls.forEach(el => {
      if (el.classList.contains('revealed')) return;
      const need = HINT_UNLOCKS[el.dataset.hint] - guessed.size;
      const locked = need > 0;
      el.classList.toggle('locked', locked);
      el.classList.toggle('ready', !locked);
      el.setAttribute('aria-disabled', String(locked));
      el.querySelector('.hint-body').textContent = locked
        ? 'Unlocks in ' + need + (need === 1 ? ' guess' : ' guesses')
        : 'Click to reveal';
    });
  }

  hintEls.forEach(el => {
    el.addEventListener('click', () => {
      if (el.classList.contains('locked')) return;
      revealHint(el);
    });
  });

  /* ---------- Custom background ---------- */
  document.getElementById('bg-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    document.documentElement.style.setProperty('--bg-image', 'url("' + URL.createObjectURL(file) + '")');
  });

  /* ---------- Status ---------- */
  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }

  /* ---------- Autocomplete ---------- */
  function norm(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  }

  function updateDropdown() {
    const q = norm(input.value);
    if (!q || gameOver) return closeDropdown();
    matches = heroes
      .filter(h => !guessed.has(h.name) && norm(h.name).includes(q))
      .sort((a, b) => {
        const as = norm(a.name).startsWith(q) ? 0 : 1;
        const bs = norm(b.name).startsWith(q) ? 0 : 1;
        return as - bs || a.name.localeCompare(b.name);
      });
    if (!matches.length) return closeDropdown();
    activeIndex = 0;
    dropdown.innerHTML = '';
    matches.forEach((h, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      const name = document.createElement('span');
      name.className = 'dd-name';
      name.textContent = h.name;
      const role = document.createElement('small');
      role.textContent = h.role;
      if (h.image) li.appendChild(makeImg(h.image, 'dd-img'));
      li.append(name, role);
      li.addEventListener('mousedown', e => { e.preventDefault(); submitGuess(h); });
      li.addEventListener('mousemove', () => { activeIndex = i; highlight(); });
      dropdown.appendChild(li);
    });
    dropdown.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight();
  }

  function highlight() {
    [...dropdown.children].forEach((li, i) => {
      li.classList.toggle('active', i === activeIndex);
      li.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false');
      if (i === activeIndex) li.scrollIntoView({ block: 'nearest' });
    });
  }

  function closeDropdown() {
    dropdown.hidden = true;
    dropdown.innerHTML = '';
    matches = [];
    activeIndex = -1;
    input.setAttribute('aria-expanded', 'false');
  }

  input.addEventListener('input', updateDropdown);
  input.addEventListener('blur', () => setTimeout(closeDropdown, 100));
  input.addEventListener('focus', updateDropdown);

  input.addEventListener('keydown', e => {
    if (gameOver) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!matches.length) return;
      activeIndex = (activeIndex + 1) % matches.length;
      highlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!matches.length) return;
      activeIndex = (activeIndex - 1 + matches.length) % matches.length;
      highlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches.length && activeIndex >= 0) {
        submitGuess(matches[activeIndex]);
      } else {
        const exact = heroes.find(h => norm(h.name) === norm(input.value));
        if (exact && guessed.has(exact.name)) setStatus('You already guessed ' + exact.name + '.', 'error');
        else if (exact) submitGuess(exact);
        else if (input.value.trim()) setStatus('No matching hero. Pick one from the list.', 'error');
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  /* ---------- Guess handling ---------- */
  function submitGuess(hero) {
    if (gameOver || guessed.has(hero.name)) return;
    guessed.add(hero.name);
    refreshHints();
    input.value = '';
    closeDropdown();
    addRow(hero);

    if (hero.name === secret.name) {
      endGame(guessed.size);
    } else {
      setStatus('Guesses: ' + guessed.size);
    }
  }

  function endGame(count) {
    gameOver = true;
    input.disabled = true;
    input.placeholder = 'Game over';
    hintEls.forEach(revealHint);
    // Wait for the last row's flip animation before celebrating
    setTimeout(() => {
      setStatus('Correct! ' + secret.name + ' in ' + count + (count === 1 ? ' guess.' : ' guesses.'), 'win');
    }, 8 * 110 + 450);
  }

  /* ---------- Tile building ---------- */
  function addRow(hero) {
    const row = document.createElement('div');
    row.className = 'row new';

    const tiles = [
      { text: hero.name, cls: 'name', image: hero.image },
      cmp(hero.gender, secret.gender),
      cmp(hero.role, secret.role),
      cmp(hero.species, secret.species),
      cmp(hero.origin, secret.origin),
      cmp(hero.affiliation, secret.affiliation),
      cmpNum(hero.health, secret.health),
      cmpNum(hero.releaseYear ?? hero.year, secret.releaseYear ?? secret.year)
    ];

    tiles.forEach((t, i) => {
      const tile = document.createElement('div');
      tile.className = 'tile ' + t.cls;
      tile.style.setProperty('--i', i);
      if (t.image) tile.appendChild(makeImg(t.image, 'tile-img'));
      const span = document.createElement('span');
      span.className = 'txt';
      span.textContent = t.text;
      tile.appendChild(span);
      if (t.arrow) {
        const a = document.createElement('span');
        a.className = 'arrow';
        a.textContent = t.arrow;
        span.appendChild(a);
      }
      row.appendChild(tile);
    });

    rowsEl.prepend(row);
  }

  function makeImg(src, cls) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
    img.className = cls;
    img.addEventListener('error', () => img.remove());
    return img;
  }

  function cmp(guess, answer) {
    return { text: guess, cls: guess === answer ? 'correct' : 'wrong' };
  }

  function cmpNum(guess, answer) {
    if (guess === answer) return { text: String(guess), cls: 'correct' };
    // Arrow points toward the secret hero's value
    return { text: String(guess), cls: 'wrong', arrow: answer > guess ? '↑' : '↓' };
  }

  init();
})();