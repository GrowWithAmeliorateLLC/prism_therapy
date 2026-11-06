/* Prism Therapy "Not sure where to start?" form.
   Sends the form to /api/lead (a Netlify function that talks to HighLevel
   server-side), then shows a thank-you message in place of the form.
   No API keys in the browser. Bot protection: hidden honeypot + fill timer,
   both checked in netlify/functions/lead.mjs. Pattern copied from ATX K9. */
(function () {
  var forms = document.querySelectorAll('form.prism-lead');
  if (!forms.length) return;

  forms.forEach(function (form) {
    var startedAt = Date.now();

    var hp = document.createElement('div');
    hp.setAttribute('aria-hidden', 'true');
    hp.style.cssText = 'position:absolute!important;left:-10000px!important;top:auto!important;width:1px!important;height:1px!important;overflow:hidden!important;';
    hp.innerHTML = '<label>Company website<input type="text" name="company_website" tabindex="-1" autocomplete="off"></label>';
    form.appendChild(hp);

    function val(name) { var el = form.elements[name]; return el && el.value ? el.value.trim() : ''; }

    // Step 2: after the lead is saved in HighLevel, show a button to the IntakeQ 15-min phone consult booking page.
    // Office matches the therapist on the call, then books the evaluation (Ashley/Renée 11/6/2026).
    var IQ_LINK = 'https://intakeq.com/booking/e3wtlj?serviceId=20651393-77d1-4abb-87c2-eccaaa50f018';

    function thanks() {
      var first = (val('name').split(' ')[0]) || 'there';
      var src = form.getAttribute('data-source') || '';
      var box = document.createElement('div');
      box.setAttribute('role', 'status');
      box.style.cssText = 'text-align:center;padding:14px 4px';
      box.innerHTML =
        '<div style="font-size:2rem" aria-hidden="true">🌈</div>' +
        '<p class="kick" style="color:var(--magenta);margin-top:6px">Step 2 of 2</p>' +
        '<h3 style="margin:4px 0 8px">Thanks, ' + first.replace(/[<>&"]/g, '') + '! Now pick a time for your phone consult.</h3>' +
        '<p style="font-weight:600;color:#55504a;max-width:46ch;margin:0 auto 18px">It\'s a quick 15-minute call so we can match you with the right therapist. We also emailed you new patient information and answers to common questions.</p>' +
        '<a class="btn cy iq-book" href="' + IQ_LINK + '" target="_blank" rel="noopener" style="display:inline-block;font-size:1rem;padding:15px 28px">Pick my consult time →</a>' +
        '<p style="font-size:.84rem;font-weight:700;margin-top:14px">Prefer to call? <a href="tel:+15123870332">(512) 387-0332</a></p>';
      form.replaceWith(box);
      box.querySelector('.iq-book').addEventListener('click', function () {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: 'consult_booking_click', form_source: src });
      });
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function failed(btn, orig) {
      if (btn) { btn.disabled = false; btn.textContent = orig; }
      var note = form.querySelector('.lead-error');
      if (!note) {
        note = document.createElement('p');
        note.className = 'lead-error';
        note.setAttribute('role', 'alert');
        note.style.cssText = 'margin-top:10px;font-weight:700;color:#b0004f;text-align:center';
        form.appendChild(note);
      }
      note.innerHTML = 'Something went wrong sending that. Please try again, or call us at <a href="tel:+15123870332">(512) 387-0332</a>.';
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type=submit]');
      var orig = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

      fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: val('name'), email: val('email'), phone: val('phone'),
          who: val('who'), loc: val('loc'),
          source: form.getAttribute('data-source') || '',
          company_website: val('company_website'),
          _elapsed: Date.now() - startedAt
        })
      }).then(function (res) {
        if (!res.ok) throw new Error('Lead ' + res.status);
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: 'generate_lead', form_source: form.getAttribute('data-source') || '' });
        thanks();
      }).catch(function (err) {
        console.error('Prism lead submit failed:', err);
        failed(btn, orig);
      });
    });
  });
})();
