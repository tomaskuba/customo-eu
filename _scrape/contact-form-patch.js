// Přesměruje všechny původní SolidPixels formuláře na Web3Forms.
// Klíč se doplňuje při buildu/deployi do globální proměnné WEB3FORMS_KEY.
(function () {
  "use strict";
  var key = (typeof window !== "undefined" && window.WEB3FORMS_KEY) || "";
  var forms = document.querySelectorAll("form.block-form, form[id^='form_']");
  if (!forms.length) return;

  forms.forEach(function (form) {
    form.setAttribute("action", "https://api.web3forms.com/submit");
    form.setAttribute("method", "POST");

    var ensureHidden = function (name, value) {
      var existing = form.querySelector("input[name='" + name + "']");
      if (existing) { existing.value = value; return; }
      var el = document.createElement("input");
      el.type = "hidden";
      el.name = name;
      el.value = value;
      form.appendChild(el);
    };
    if (key) ensureHidden("access_key", key);
    ensureHidden("subject", "Nová zpráva z customo.eu");
    ensureHidden("from_name", "customo.eu");

    // Honeypot
    var honey = document.createElement("input");
    honey.type = "checkbox";
    honey.name = "botcheck";
    honey.style.display = "none";
    honey.tabIndex = -1;
    honey.setAttribute("autocomplete", "off");
    form.appendChild(honey);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!key) {
        alert("Formulář zatím není nakonfigurován. Napište prosím na jana@customo.eu.");
        return;
      }
      var fd = new FormData(form);
      var submitBtn = form.querySelector("[type='submit']");
      if (submitBtn) submitBtn.disabled = true;

      fetch("https://api.web3forms.com/submit", { method: "POST", body: fd })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.success) {
            alert("Děkuji, zpráva byla odeslána. Brzy se ozvu.");
            form.reset();
          } else {
            alert("Nepodařilo se odeslat. Napište prosím na jana@customo.eu.");
          }
        })
        .catch(function () {
          alert("Nepodařilo se odeslat. Napište prosím na jana@customo.eu.");
        })
        .finally(function () {
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  });
})();
