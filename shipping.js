(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('shippingForm');
  const steps = [...form.querySelectorAll('[data-step]')];
  let step = 0, locations = [], sending = false;
  const requestId = crypto.randomUUID();
  const value = name => String(new FormData(form).get(name) || '').trim();
  const selectedLocation = () => locations.find(x => x.id === $('locationId').value);
  const isQuote = () => value('requestKind') === 'quote';
  function fail(message) { $('formError').textContent = message; $('formError').hidden = !message; }
  function updateMode() {
    const quote = isQuote();
    form.querySelectorAll('[data-dropoff]').forEach(el => {
      el.hidden = quote;
      el.querySelectorAll('input').forEach(input => {
        input.disabled = quote;
        input.required = !quote && (input.hasAttribute('data-dropoff-required') || input.id === 'senderCountry');
      });
    });
    $('contactHint').textContent = quote ? 'We only need your contact details for a first quote. Staff may ask for more shipment details before confirming a price.' : 'Add the sender and receiver details so the counter can prepare your shipment.';
  }
  function updateBranch() {
    const branch = selectedLocation();
    $('sideName').textContent = branch ? branch.name : 'Choose a location';
    $('sideAddress').textContent = branch ? branch.address : 'Your request will go to the location you select.';
    for (const prefix of ['side', 'receipt']) {
      $(prefix + 'Call').hidden = !branch?.tel;
      $(prefix + 'Map').hidden = !branch;
      if (branch) {
        $(prefix + 'Call').href = 'tel:' + branch.tel;
        $(prefix + 'Call').textContent = 'Call ' + branch.phone;
        $(prefix + 'Map').href = branch.map;
      }
    }
  }
  function fieldValid(section) {
    for (const input of section.querySelectorAll('input,select,textarea')) {
      if (input.disabled || !input.willValidate) continue;
      if (!input.checkValidity()) {
        const details = input.closest('details');
        if (details) details.open = true;
        input.reportValidity(); input.focus(); return false;
      }
    }
    return true;
  }
  const dimensions = () => ['length', 'width', 'height'].filter(k => value(k)).map(k => `${k}: ${value(k)} ${value('sizeUnit')}`).join(', ');
  function buildPayload() {
    const data = Object.fromEntries(new FormData(form));
    return {...data, intakeChannel:'online', requestId, senderCountry:data.senderCountry || 'United States', weight:data.weight ? `${data.weight} ${data.weightUnit}` : '', dimensions:dimensions(), notes:[`Request: ${isQuote() ? 'Quote first' : 'Prepare drop-off'}`, `Handoff: ${value('handoff') === 'pickup-request' ? 'Pickup requested — staff must confirm' : 'Customer will bring items to counter'}`, `Packing: ${value('packing')}`, value('notes')].filter(Boolean).join('\n')};
  }
  function addReview(title, entries, editStep) {
    const block = document.createElement('section'); block.className = 'review-block';
    const edit = document.createElement('button'); edit.type='button'; edit.textContent='Edit ' + title.toLowerCase(); edit.addEventListener('click', () => showStep(editStep));
    const heading = document.createElement('h3'); heading.textContent=title;
    const dl = document.createElement('dl');
    entries.forEach(([label,text]) => { const dt=document.createElement('dt'), dd=document.createElement('dd');dt.textContent=label;dd.textContent=text || 'Not provided';dl.append(dt,dd); });
    block.append(edit,heading,dl); $('review').append(block);
  }
  function renderReview() {
    const data=buildPayload(), branch=selectedLocation(); $('review').replaceChildren();
    addReview('Shipment', [['Request', isQuote()?'Quote first':'Prepare a drop-off'], ['Counter',branch.name+'\n'+branch.address],['Destination',[data.receiverCity,data.receiverPostal,data.receiverCountry].filter(Boolean).join(', ')],['Contents',data.shipmentType+' · '+data.pieces+' piece(s)\n'+data.contents],['Weight and size',[data.weight || 'Weight: staff to confirm',data.dimensions || 'Size: staff to confirm'].join('\n')],['Handoff',data.handoff==='pickup-request'?'Ask about pickup — not booked':'Bring to counter'],['Packing',({needed:'Packing help needed',packed:'Already packed',unsure:'Please advise'})[data.packing]],['Shipping date',data.readyDate || 'To be confirmed']],0);
    const entries=[['Your contact',[data.senderName,data.senderEmail,data.senderPhone].join('\n')]];
    if(!isQuote()) entries.push(['Your return address',[data.senderCompany,data.senderAddress1,data.senderAddress2,data.senderCity,data.senderState,data.senderPostal,data.senderCountry].filter(Boolean).join('\n')],['Receiver',[data.receiverName,data.receiverCompany,data.receiverAddress1,data.receiverAddress2,data.receiverCity,data.receiverState,data.receiverPostal,data.receiverCountry,data.receiverPhone,data.receiverEmail].filter(Boolean).join('\n')]);
    entries.push(['Additional notes',value('notes') || 'None']); addReview('Contact details',entries,1);
  }
  function showStep(next, focus=true) {
    step=next; fail(''); steps.forEach((section,i) => section.hidden=i!==step);
    document.querySelectorAll('.steps li').forEach((li,i) => {if(i===step)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
    $('back').hidden=step===0; $('next').hidden=step===2; $('submit').hidden=step!==2;
    if(step===2)renderReview(); if(focus)steps[step].querySelector('h2').focus();
  }
  $('next').addEventListener('click',()=>{if(fieldValid(steps[step]))showStep(step+1);});
  $('back').addEventListener('click',()=>showStep(step-1));
  form.addEventListener('change',event=>{if(event.target.name==='requestKind')updateMode();if(event.target.id==='locationId')updateBranch();});
  form.addEventListener('submit', async event => {
    event.preventDefault(); if(sending)return;
    if(step<2){if(fieldValid(steps[step]))showStep(step+1);return;}
    for(let i=0;i<steps.length;i++){if(!fieldValid(steps[i])){showStep(i);fieldValid(steps[i]);return;}}
    if(!selectedLocation()){showStep(0);fail('Choose an available counter.');return;}
    sending=true; $('submit').disabled=true; $('submit').textContent='Sending…'; $('back').disabled=true;fail('');
    const branch=selectedLocation(), data=buildPayload();
    try {
      const response=await fetch('/api/customer-shipments?source=qr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok || !result.ok || !result.shipment?.number)throw new Error(result.error || 'We could not confirm your request. Please try again or call your counter.');
      $('requestCode').textContent=result.shipment.number;
      $('receiptBranch').textContent=branch.name; $('receiptAddress').textContent=branch.address;
      $('receiptNext').textContent=data.handoff==='pickup-request'?'Your pickup question has been sent to the counter. Call to confirm availability, price and timing before expecting a collection.':data.requestKind==='quote'?'Your quote request has been sent to this counter for review. Staff must confirm the price and delivery estimate. If you have an urgent deadline, call the counter.':'Save this code and show it with your items at this counter. Staff will verify the details, confirm the price and help finish your shipment. Check current hours and the last collection before traveling.';
      $('requestCard').hidden=true; $('receipt').hidden=false; $('receipt').focus();
      form.reset();
    } catch(error) { fail(error.message); }
    finally{sending=false; $('submit').disabled=false; $('submit').textContent='Send request'; $('back').disabled=false;}
  });
  $('printReceipt').addEventListener('click',()=>window.print());
  $('copyReceipt').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('requestCode').textContent);$('copyStatus').textContent='Code copied.';}catch{$('copyStatus').textContent='Select and copy the code above.';}});
  const params=new URLSearchParams(location.search);
  if(params.get('mode')==='quote')form.querySelector('[name=requestKind][value=quote]').checked=true;
  updateMode();showStep(0,false);
  fetch('/assets/locations.json').then(response=>{if(!response.ok)throw new Error();return response.json();}).then(data=>{
    locations=data.filter(x=>!x.openingSoon);
    locations.forEach(branch=>{$('locationId').add(new Option(branch.city+', '+branch.state,branch.id));});
    const requested=params.get('location');
    if(requested && locations.some(x=>x.id===requested))$('locationId').value=requested;
    else if(requested)fail('That counter is not available for online requests. Please choose another location.');
    updateBranch();
  }).catch(()=>{fail('Locations could not load. Refresh this page or use the Locations link to call a counter.');$('next').disabled=true;});
})();
