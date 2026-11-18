'use strict';
(() => {
  const KEY = 'conectabarrio-mvp-v1';
  const VIEWS = ['inicio','red','reservar','pase','cobertura','panel'];
  const TASKS = ['Estudiar','Trabajar','Hacer gestiones'];
  const SLOTS = ['9:00 a. m.','12:00 p. m.','4:00 p. m.'];
  const SLOT_STARTS = [9*60,12*60,16*60];
  const DURATIONS = [30,60,90];
  const ACCESS_OPTIONS = ['Punto comunitario','Conexión al hogar','Ambas opciones'];
  const CENTER_OPTIONS = ['Sí','No','Depende de la ubicación'];
  const FREQUENCY_OPTIONS = ['Todos los días','Varias veces por semana','Una vez por semana','Ocasionalmente'];
  const CAPACITY = 3;
  const SECTORS = {
    nuevo:{name:'Nuevo Cuño',median:32,n:33,min:14,max:81},
    maloja:{name:'La Maloja',median:32,n:19,min:23,max:102},
    hoyo:{name:'Hoyo Vicioso',median:60,n:16,min:14,max:170}
  };
  const EQUIPMENT = {
    deco:{name:'TP-Link Deco',limit:15,reference:'≈15 m',type:'mesh doméstico'},
    eap:{name:'EAP225-Outdoor',limit:200,reference:'200 m+',type:'punto de acceso exterior'},
    cpe210:{name:'CPE210',limit:5000,reference:'hasta 5 km',type:'enlace dirigido exterior'},
    cpe510:{name:'CPE510',limit:15000,reference:'hasta 15 km',type:'enlace dirigido exterior'}
  };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  let state = {bookings:[],requests:[]};
  let persistent = true;
  let lastTicket = null;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && Array.isArray(raw.bookings) && Array.isArray(raw.requests)) state = raw;
  } catch (_) { persistent = false; }
  const requestedTicket=new URLSearchParams(location.search).get('pase');
  if(state.bookings.some(item=>item.code===requestedTicket))lastTicket=requestedTicket;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = (v,max=90) => String(v ?? '').trim().replace(/\s+/g,' ').slice(0,max);
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  function code(prefix) {
    let value;
    do {
      const bytes = new Uint8Array(3);
      crypto.getRandomValues(bytes);
      value = prefix + '-' + Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    } while (state.bookings.some(x=>x.code===value) || state.requests.some(x=>x.code===value));
    return value;
  }
  function save() {
    try { localStorage.setItem(KEY,JSON.stringify(state)); }
    catch (_) { persistent = false; }
    $('#storage-warning').hidden = persistent;
  }
  function dateLabel(v) {
    return new Date(v+'T12:00:00').toLocaleDateString('es-PR',{day:'numeric',month:'long',year:'numeric'});
  }
  function quickDate(offset) {
    const d=new Date();d.setDate(d.getDate()+offset);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function clockLabel(totalMinutes) {
    const hours=Math.floor(totalMinutes/60);
    const hour=hours%12||12;
    return `${hour}:${String(totalMinutes%60).padStart(2,'0')} ${hours<12?'a. m.':'p. m.'}`;
  }
  function updateBookingSummary() {
    const date=$('#booking-date').value,slot=$('input[name="slot"]:checked')?.value,duration=Number($('#booking-duration').value);
    $('#summary-task').textContent=$('input[name="task"]:checked')?.value||'Por escoger';
    $('#summary-date').textContent=date?dateLabel(date):'Por escoger';
    $('#summary-slot').textContent=slot||'Por escoger';
    $('#summary-duration').textContent=`${duration} minutos`;
    $$('[data-quick-date]').forEach(button=>button.setAttribute('aria-pressed',String(date===quickDate(Number(button.dataset.quickDate)))));
  }
  function show(view,push=true) {
    if (!VIEWS.includes(view)) view='inicio';
    if (view==='pase' && !lastTicket && state.bookings.length) lastTicket=state.bookings[state.bookings.length-1].code;
    if (view==='pase' && !lastTicket) view='reservar';
    $$('.view').forEach(el=>el.hidden=el.id!=='view-'+view);
    $$('nav [data-go]').forEach(el=>{
      const active=!el.dataset.section && (el.dataset.go===view || (view==='pase' && el.dataset.go==='reservar'));
      if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
    });
    if(view==='panel')renderPanel();
    if(view==='pase')renderTicket();
    if(view==='reservar')renderSlots();
    if(view==='red')renderNetworkLab();
    document.body.dataset.view=view;
    closeMenu();
    document.title = ({inicio:'Red comunitaria',red:'Explorador de red',reservar:'Reserva preliminar',pase:'Mi pase',cobertura:'Solicitar cobertura',panel:'Panel de registros'}[view])+' · ConectaBarrio';
    if(push){
      const u=new URL(location.href);u.searchParams.set('vista',view);u.hash='';
      if(view==='pase')u.searchParams.set('pase',lastTicket);else u.searchParams.delete('pase');
      history.pushState({view},'',u);
      window.scrollTo({top:0,behavior:'auto'});
      $('#main').focus({preventScroll:true});
    }
  }
  function renderSlots() {
    const date=$('#booking-date').value;
    const selected=$('input[name="slot"]:checked')?.value;
    const duration=Number($('#booking-duration').value);
    $('#slot-options').innerHTML = SLOTS.map((slot,i)=>{
      const used=state.bookings.filter(x=>x.date===date && x.slot===slot && x.status==='Activo').length;
      const left=Math.max(0,CAPACITY-used);
      const end=clockLabel(SLOT_STARTS[i]+duration);
      return `<label class="slot-choice"><input id="booking-slot-${i}" type="radio" name="slot" value="${slot}" aria-describedby="booking-slot-hint" required ${left===0?'disabled':''} ${selected===slot&&left>0?'checked':''}><span>${slot}<small><span class="slot-end">Hasta ${end}</span>${left===0?'Completo en esta demo':left+' cupos de ejemplo'}</small></span></label>`;
    }).join('');
    updateBookingSummary();
  }
  function renderNetworkLab() {
    const sectorKey=$('#lab-sector').value;
    const sector=SECTORS[sectorKey];
    $('#lab-sector-detail').textContent=sector?`${sector.n} estructuras · mediana ${sector.median} m · rango ${sector.min}–${sector.max} m. Distancias a vecinos, no al centro.`:'Distancia hipotética definida por ti; no procede de la muestra de sectores.';
    const distance=Number($('#lab-distance').value);
    const device=EQUIPMENT[$('#lab-device').value];
    const status=$('#lab-status');
    if(!Number.isInteger(distance)||distance<1||distance>15000){
      $('#lab-selected-distance').textContent='—';
      $('#lab-path-distance').textContent='—';
      $('#lab-equipment-reference').textContent=device.reference;
      $('#lab-track-fill').style.width='0%';
      $('#lab-comparison').textContent='Selecciona una distancia de 1 a 15,000 metros.';
      $('#lab-status-label').textContent='Dato pendiente';
      $('#lab-status-title').textContent='Revisa la distancia para continuar.';
      $('#lab-status-text').textContent='El valor debe ser un número entero positivo, dentro del rango del comparador.';
      $('#lab-checks').innerHTML='';
      status.dataset.tone='warning';
      return;
    }
    const tooFar=distance>device.limit;
    const obst=$('#lab-obstacle').value,visibility=$('#lab-visibility').value;
    const directional=device.type==='enlace dirigido exterior';
    $('#lab-selected-distance').textContent=distance.toLocaleString('es-PR')+' m';
    $('#lab-path-distance').textContent=distance.toLocaleString('es-PR')+' m';
    $('#lab-equipment-reference').textContent=device.reference;
    $('#lab-track-fill').style.width=Math.max(1,Math.min(100,distance/device.limit*100))+'%';
    $('#lab-comparison').textContent=tooFar?`La distancia supera la referencia publicada para ${device.name}.`:`La distancia está bajo la referencia publicada para ${device.name}. Eso no determina la calidad del enlace.`;
    let title,detail;
    if(device===EQUIPMENT.deco){
      title=tooFar?'Para este salto, un mesh doméstico no sería la primera opción.':'La distancia permite explorar un mesh doméstico, pero falta medir.';
      detail='La referencia de 15 m es una recomendación de ubicación inalámbrica entre unidades Deco, no un alcance exterior garantizado entre casas.';
    } else if(device===EQUIPMENT.eap){
      title=tooFar?'Conviene evaluar un enlace exterior dedicado.':'La distancia permite estudiar un punto de acceso exterior.';
      detail='El alcance anunciado del EAP225-Outdoor en espacio abierto no garantiza que un celular o una vivienda reciban una conexión estable.';
    } else {
      title=tooFar?'La separación excede la referencia publicada para este equipo.':'Se puede estudiar un enlace punto a punto con equipos exteriores.';
      detail='Los CPE se utilizan en enlaces dirigidos entre equipos compatibles; no sustituyen por sí solos el Wi-Fi dentro de cada hogar.';
    }
    if(directional && visibility==='no'){
      title='Sin línea de vista, el enlace dirigido requiere otra ruta o ubicación.';
      detail+=' Hay obstáculos declarados entre los puntos, por lo que la distancia anunciada no sirve para darlo por viable.';
    } else if(directional && visibility==='incierta'){
      detail+=' Es indispensable comprobar la línea de vista desde las alturas reales de instalación.';
    } else if(!directional && visibility==='no'){
      title='Los obstáculos impiden sacar conclusiones solo con la distancia.';
      detail+=' No se debe asumir una conexión estable a través de las obstrucciones del trayecto.';
    }
    if(obst==='vegetacion')detail+=' Los árboles y la vegetación pueden afectar la señal.';
    if(obst==='estructuras')detail+=' Las paredes, los edificios y el relieve pueden interrumpir o debilitar el trayecto.';
    if(obst==='incierto')detail+=' Antes de avanzar hay que identificar los obstáculos del trayecto.';
    $('#lab-status-label').textContent=visibility==='no'?'Trayecto obstruido':tooFar?'Referencia excedida':'Opción para estudiar';
    $('#lab-status-title').textContent=title;
    $('#lab-status-text').textContent=detail;
    status.dataset.tone=(tooFar||visibility==='no')?'warning':'neutral';
    const checks=['Confirmar ubicación, altura y distancia real entre los dos equipos.','Evaluar obstáculos, interferencia y línea de vista del trayecto.','Medir señal, velocidad útil, estabilidad y capacidad con usuarios.'];
    if(directional)checks.push('Verificar el par de radios, la orientación y el acceso Wi-Fi al destino.');
    else if(device===EQUIPMENT.eap)checks.push('Comprobar la conexión de retorno del dispositivo cliente, no solo la señal recibida.');
    else checks.push('Comprobar atenuación por paredes y calidad del enlace entre nodos.');
    $('#lab-checks').innerHTML=checks.map(x=>`<li>${esc(x)}</li>`).join('');
  }
  function closeMenu() {
    $('#menu-toggle').setAttribute('aria-expanded','false');
    $('#public-nav').classList.remove('open');
  }
  function goToSection(id) {
    if(!['como-funciona','sobre-conectabarrio','preguntas-frecuentes'].includes(id))return;
    const section=document.getElementById(id);
    const u=new URL(location.href);u.hash=id;history.replaceState(history.state,'',u);
    section.scrollIntoView({block:'start',behavior:'auto'});
    section.focus({preventScroll:true});
  }
  // Validation for the forms in this local demonstration.
  function clearValidation(form) {
    form.querySelectorAll('.field-error').forEach(node=>{node.textContent='';node.hidden=true;});
    form.querySelectorAll('[aria-invalid]').forEach(control=>{
      control.removeAttribute('aria-invalid');
      const ids=(control.getAttribute('aria-describedby')||'').split(' ').filter(id=>id&&!id.endsWith('-error'));
      if(ids.length)control.setAttribute('aria-describedby',ids.join(' '));else control.removeAttribute('aria-describedby');
    });
  }
  function markField(form,name,message) {
    const prefix=form.id==='booking-form'?'booking':'coverage';
    const controls=Array.from(form.elements).filter(el=>el.name===name);
    const inline=document.getElementById(prefix+'-'+name+'-error');
    if(inline){inline.textContent=message;inline.hidden=false;}
    controls.forEach(control=>{
      control.setAttribute('aria-invalid','true');
      if(inline){
        const ids=new Set((control.getAttribute('aria-describedby')||'').split(' ').filter(Boolean));
        ids.add(inline.id);control.setAttribute('aria-describedby',Array.from(ids).join(' '));
      }
    });
    return controls.find(el=>!el.disabled)?.id || prefix+'-'+name;
  }
  function displayErrors(node,items) {
    node.innerHTML='<h2>Revisa estos datos</h2><ul>'+items.map(item=>'<li>'+(item.target?`<a href="#${esc(item.target)}">${esc(item.text)}</a>`:esc(item.text))+'</li>').join('')+'</ul>';
    node.hidden=false;node.focus();
  }
  function error(id,text,fieldName) {
    const node=$(id);node.innerHTML='';node.hidden=!text;
    if(text){const target=fieldName?markField(node.closest('form'),fieldName,text):null;displayErrors(node,[{text,target}]);}
  }
  function validateForm(form) {
    clearValidation(form);
    const labels={alias:'Escribe un nombre o alias.',community:'Escribe el nombre de tu sector o comunidad.',task:'Selecciona una actividad.',date:'Selecciona una fecha.',duration:'Selecciona cuánto tiempo necesitarías.',slot:'Selecciona un horario.',current:'Selecciona cómo te conectas actualmente.',frequency:'Indica con qué frecuencia necesitarías conectarte.',access:'Indica qué tipo de acceso te ayudaría más.',center:'Indica si podrías visitar un punto comunitario.',acknowledge:'Confirma que comprendes el estado actual del servicio.'};
    const seen=new Set(),items=[];
    Array.from(form.elements).forEach(control=>{
      if(!control.willValidate||control.validity.valid||seen.has(control.name))return;
      seen.add(control.name);
      const text=control.validity.rangeUnderflow?'Selecciona hoy o una fecha posterior.':(labels[control.name]||'Revisa este campo.');
      items.push({text,target:markField(form,control.name,text)});
    });
    if(items.length){displayErrors(form.querySelector('.form-error'),items);return false;}
    return true;
  }
  function renderTicket() {
    const b=state.bookings.find(x=>x.code===lastTicket);
    if(!b){$('#ticket-holder').innerHTML='';return;}
    const active=b.status==='Activo';
    $('.ticket-heading').classList.toggle('is-cancelled',!active);
    $('#ticket-state-label').textContent=active?'Paso 2 de 2 · Pase generado':'Pase cancelado';
    $('#ticket-state-icon').setAttribute('href',active?'#i-check':'#i-close');
    $('#ticket-title').textContent=active?'Tu pase está listo.':'Este pase está cancelado.';
    $('#ticket-description').textContent=active?'Revisa los detalles. Puedes imprimir o cancelar el pase.':'El turno quedó liberado. Puedes seleccionar otro.';
    $('#ticket-holder').innerHTML = `<article class="ticket"><div class="ticket-head"><strong>ConectaBarrio</strong><span>${b.status==='Activo'?'PASE PRELIMINAR':'PASE CANCELADO'}</span></div><div class="ticket-body"><p>Hola, ${esc(b.alias)}. Este es tu código:</p><div class="ticket-code">${esc(b.code)}</div><div class="ticket-detail"><div><span>ACTIVIDAD</span><strong>${esc(b.task)}</strong></div><div><span>FECHA</span><strong>${esc(dateLabel(b.date))}</strong></div><div><span>HORARIO</span><strong>${esc(b.slot)} · ${esc(b.duration||20)} min</strong></div><div><span>PUNTO PROPUESTO</span><strong>Camino Nuevo, Yabucoa</strong></div></div></div><div class="ticket-bottom"><p>Este pase es preliminar: todavía no confirma servicio de Internet ni una ubicación habilitada.</p>${b.status==='Activo'?'<button id="cancel-ticket" class="danger-link" type="button">Cancelar pase</button>':'<span class="cancelled-tag">Pase cancelado</span>'}</div></article>`;
  }
  function renderPanel() {
    $('#stat-bookings').textContent=state.bookings.length;
    $('#stat-active').textContent=state.bookings.filter(x=>x.status==='Activo').length;
    $('#stat-requests').textContent=state.requests.length;
    $('#activity-bars').innerHTML=TASKS.map(task=>{
      const n=state.bookings.filter(x=>x.task===task).length;
      const width=state.bookings.length?n/state.bookings.length*100:0;
      return `<div class="bar-row"><div class="bar-title"><span>${task}</span><strong>${n}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div></div>`;
    }).join('');
    const accessData=[...ACCESS_OPTIONS,'Sin especificar'];
    $('#access-bars').innerHTML=accessData.map(option=>{
      const n=state.requests.filter(x=>(x.access||'Sin especificar')===option).length;
      const width=state.requests.length?n/state.requests.length*100:0;
      return `<div class="bar-row"><div class="bar-title"><span>${esc(option)}</span><strong>${n}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div></div>`;
    }).join('');
    $('#frequency-bars').innerHTML=[...FREQUENCY_OPTIONS,'Sin especificar'].map(option=>{
      const n=state.requests.filter(x=>(x.frequency||'Sin especificar')===option).length;
      const width=state.requests.length?n/state.requests.length*100:0;
      return `<div class="bar-row"><div class="bar-title"><span>${esc(option)}</span><strong>${n}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div></div>`;
    }).join('');
    const centerCounts=CENTER_OPTIONS.map(option=>state.requests.filter(x=>x.center===option).length);
    const centerAnswered=centerCounts.reduce((a,b)=>a+b,0);
    $('#center-interest').textContent=centerAnswered?`Entre ${centerAnswered} respuesta${centerAnswered===1?'':'s'} registradas: sí ${centerCounts[0]}, no ${centerCounts[1]}, depende de la ubicación ${centerCounts[2]}.`:'Todavía no hay respuestas sobre esta opción.';
    const records=[...state.bookings.map(x=>({...x,type:'Pase',detail:`${dateLabel(x.date)} · ${x.slot} · ${x.duration||20} min · ${x.status}`})),...state.requests.map(x=>({...x,type:'Cobertura',detail:`${x.community} · ${x.access||'Preferencia no registrada'}`}))].sort((a,b)=>b.created.localeCompare(a.created));
    $('#records-body').innerHTML=records.map(x=>`<tr><td>${x.type}<br><span class="record-tag">LOCAL</span></td><td>${x.type==='Pase'?`<button type="button" class="record-code" data-ticket="${esc(x.code)}" aria-label="Ver pase ${esc(x.code)}"><code>${esc(x.code)}</code><svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></button>`:`<code>${esc(x.code)}</code>`}</td><td>${esc(x.alias)}</td><td>${esc(x.task)}</td><td>${esc(x.detail)}</td></tr>`).join('');
    $('#records-empty').hidden=records.length>0;
    $('#view-panel .table-scroll').hidden=records.length===0;
    $('#export-data').disabled=records.length===0;
    $('#reset-data').disabled=records.length===0;
  }
  document.addEventListener('click',event=>{
    const ticket=event.target.closest('[data-ticket]');
    if(ticket&&state.bookings.some(item=>item.code===ticket.dataset.ticket)){lastTicket=ticket.dataset.ticket;show('pase');return;}
    const day=event.target.closest('[data-quick-date]');
    if(day){$('#booking-date').value=quickDate(Number(day.dataset.quickDate));$('#booking-date').dispatchEvent(new Event('change',{bubbles:true}));return;}
    const task=event.target.closest('[data-task]');
    if(task){
      const radio=$(`input[name="task"][value="${task.dataset.task}"]`);
      if(radio)radio.checked=true;
      $('#summary-task').textContent=task.dataset.task;
      show('reservar');return;
    }
    const go=event.target.closest('[data-go]');
    if(go){event.preventDefault();show(go.dataset.go);if(go.dataset.section)goToSection(go.dataset.section);return;}
    if(event.target.closest('#cancel-ticket')){
      const booking=state.bookings.find(x=>x.code===lastTicket);
      if(booking){booking.status='Cancelado';save();renderTicket();$('#ticket-holder').focus();}
    }
  });
  $('#lab-sector').addEventListener('change',event=>{
    const sector=SECTORS[event.target.value];
    $('#lab-distance').value=sector?sector.median:100;
    renderNetworkLab();
  });
  $('#lab-distance').addEventListener('input',()=>{
    $('#lab-sector').value='manual';
    renderNetworkLab();
  });
  ['#lab-device','#lab-obstacle','#lab-visibility'].forEach(selector=>$(selector).addEventListener('change',renderNetworkLab));
  $('#booking-date').min=today();
  $('#booking-date').value=today();
  $('#booking-date').addEventListener('change',renderSlots);
  $('#booking-form').addEventListener('change',event=>{
    if(event.target.name==='duration')renderSlots();else updateBookingSummary();
  });
  $('#booking-form').addEventListener('submit',event=>{
    event.preventDefault();error('#booking-error','');
    const form=event.currentTarget;
    if(!validateForm(form))return;
    const data=new FormData(form);
    const alias=clean(data.get('alias'),32),task=data.get('task'),date=data.get('date'),slot=data.get('slot'),duration=Number(data.get('duration'));
    if(!alias){error('#booking-error','Escribe un nombre o alias para tu pase.','alias');return;}
    if(!TASKS.includes(task)||!SLOTS.includes(slot)||!DURATIONS.includes(duration)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<today()){error('#booking-error','Revisa la actividad, la fecha, la duración y el turno.');return;}
    const used=state.bookings.filter(x=>x.date===date&&x.slot===slot&&x.status==='Activo');
    if(used.length>=CAPACITY){renderSlots();error('#booking-error','Ese turno ya no tiene cupos disponibles. Elige otro.','slot');return;}
    if(used.some(x=>x.alias.toLocaleLowerCase()===alias.toLocaleLowerCase())){error('#booking-error','Ya tienes un pase con ese alias para ese turno.','alias');return;}
    const booking={code:code('CB'),alias,task,date,slot,duration,status:'Activo',created:new Date().toISOString(),origin:'ensayo'};
    state.bookings.push(booking);lastTicket=booking.code;save();show('pase');
  });
  $('#coverage-form').addEventListener('submit',event=>{
    event.preventDefault();error('#coverage-error','');$('#coverage-success').hidden=true;
    const form=event.currentTarget;if(!validateForm(form))return;
    const data=new FormData(form),alias=clean(data.get('alias'),32),community=clean(data.get('community'),90),task=data.get('task'),access=data.get('access'),center=data.get('center'),frequency=data.get('frequency');
    if(!alias||!community||!TASKS.includes(task)){error('#coverage-error','Completa tu alias, comunidad y actividad.',!alias?'alias':!community?'community':'task');return;}
    if(!FREQUENCY_OPTIONS.includes(frequency)){error('#coverage-error','Indica con qué frecuencia necesitarías conectarte.','frequency');return;}
    if(!ACCESS_OPTIONS.includes(access)||!CENTER_OPTIONS.includes(center)){error('#coverage-error','Selecciona el tipo de acceso y si podrías visitar un punto comunitario.',!ACCESS_OPTIONS.includes(access)?'access':'center');return;}
    if(state.requests.some(x=>x.alias.toLocaleLowerCase()===alias.toLocaleLowerCase()&&x.community.toLocaleLowerCase()===community.toLocaleLowerCase())){error('#coverage-error','Ya existe una solicitud con ese alias para esta comunidad.','alias');return;}
    const request={code:code('SC'),alias,community,task,current:clean(data.get('current')),frequency,access,center,budget:clean(data.get('budget')),created:new Date().toISOString(),origin:'ensayo'};
    state.requests.push(request);save();form.reset();
    const notice=$('#coverage-success');
    notice.innerHTML=`<div class="confirmation-title"><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>Interés registrado</div><p>Tu código es <code>${esc(request.code)}</code>. Se guardó en este navegador y no confirma cobertura ni instalación.</p><a href="?vista=panel" data-go="panel" class="text-link">Ver registro en el panel <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></a>`;
    notice.hidden=false;notice.focus({preventScroll:true});notice.scrollIntoView({behavior:'auto',block:'center'});
  });
  $('#print-ticket').addEventListener('click',()=>window.print());
  $('#reset-data').addEventListener('click',()=>{
    if(!window.confirm('¿Borrar todos los pases y solicitudes guardados en este navegador?'))return;
    state={bookings:[],requests:[]};lastTicket=null;save();renderPanel();renderSlots();
  });
  $('#export-data').addEventListener('click',()=>{
    const headers=['tipo','codigo','alias','actividad','fecha','turno','duracion_minutos','comunidad','situacion_actual','frecuencia_necesidad','acceso_preferido','posibilidad_visitar_centro','aportacion_exploratoria','estado','origen'];
    const rows=[...state.bookings.map(x=>['pase',x.code,x.alias,x.task,x.date,x.slot,x.duration||20,'Camino Nuevo, Yabucoa','','','','','',x.status,'ensayo']),...state.requests.map(x=>['cobertura',x.code,x.alias,x.task,'','','',x.community,x.current,x.frequency||'',x.access||'',x.center||'',x.budget,'por evaluar','ensayo'])];
    const cell=(v)=>{let value=String(v??'');if(/^[=+\-@\t\r]/.test(value))value="'"+value;return '"'+value.replace(/"/g,'""')+'"';};
    const csv='\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='conectabarrio-registros-'+today()+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('#menu-toggle').addEventListener('click',()=>{
    const open=$('#menu-toggle').getAttribute('aria-expanded')!=='true';
    $('#menu-toggle').setAttribute('aria-expanded',String(open));$('#public-nav').classList.toggle('open',open);
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&$('#menu-toggle').getAttribute('aria-expanded')==='true'){closeMenu();$('#menu-toggle').focus();}
  });
  document.addEventListener('click',event=>{
    const link=event.target.closest('.form-error a');
    if(link){event.preventDefault();document.getElementById(link.hash.slice(1))?.focus();}
  });
  window.addEventListener('popstate',()=>{
    const params=new URLSearchParams(location.search),ticket=params.get('pase');
    if(state.bookings.some(item=>item.code===ticket))lastTicket=ticket;
    show(params.get('vista')||'inicio',false);if(location.hash)goToSection(location.hash.slice(1));
  });
  window.addEventListener('storage',event=>{
    if(event.key!==KEY)return;
    try{const next=JSON.parse(event.newValue||'null');state=next&&Array.isArray(next.bookings)&&Array.isArray(next.requests)?next:{bookings:[],requests:[]};renderSlots();renderPanel();}catch(_){}
  });
  $('#storage-warning').hidden=persistent;
  renderSlots();renderPanel();show(new URLSearchParams(location.search).get('vista')||'inicio',false);
  if(location.hash&&(!new URLSearchParams(location.search).get('vista')||new URLSearchParams(location.search).get('vista')==='inicio'))goToSection(location.hash.slice(1));
})();
