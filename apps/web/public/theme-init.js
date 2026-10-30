// Applique le thème mémorisé avant l'affichage pour éviter un flash de couleurs.
// Valeurs synchronisées avec ACCENTS dans packages/shared (vérifié par un test).
(function () {
  var accents = {
    foret: ['#1F3D2B', '#A9C8A2'],
    sauge: ['#3F5E3A', '#B9D1B2'],
    lac: ['#1F4E5F', '#9CC7D6'],
    miel: ['#7A4B12', '#E2B36A'],
    bruyere: ['#5B3A5E', '#D3B3D6'],
  };
  var theme = 'system';
  var accent = 'foret';
  try {
    theme = localStorage.getItem('eko-theme') || 'system';
    accent = localStorage.getItem('eko-accent') || 'foret';
  } catch (e) {}
  var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  var pair = accents[accent] || accents.foret;
  root.style.setProperty('--accent-light', pair[0]);
  root.style.setProperty('--accent-dark', pair[1]);
})();
