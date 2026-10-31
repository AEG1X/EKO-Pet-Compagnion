// Fiche publique de la médaille : ajout facultatif de la position au signalement.
// La position n'est demandée qu'après un appui sur le bouton ; sans elle, le formulaire fonctionne.
(function () {
  var box = document.querySelector('[data-geo]');
  if (!box || !('geolocation' in navigator)) return;
  var button = document.getElementById('r-geo');
  var status = document.getElementById('r-geo-status');
  var lat = document.getElementById('r-lat');
  var lon = document.getElementById('r-lon');
  var acc = document.getElementById('r-acc');
  box.hidden = false;
  button.addEventListener('click', function () {
    button.disabled = true;
    status.textContent = 'Recherche de ta position…';
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        lat.value = pos.coords.latitude.toFixed(6);
        lon.value = pos.coords.longitude.toFixed(6);
        acc.value = Math.round(pos.coords.accuracy);
        button.textContent = '📍 Position jointe';
        status.textContent = 'Position jointe (précision d’environ ' + Math.round(pos.coords.accuracy) + ' m). Elle partira avec ton message.';
      },
      function () {
        button.disabled = false;
        status.textContent = 'Position non partagée. Tu peux quand même envoyer ton message.';
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
})();
