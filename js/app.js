/* Painel de Transparência — Recursos de Resposta a Desastres (S2iD)
   SEDEC/MIDR · atende TCU 9.7.1/9.7.2 · dados públicos S2iD, recorte 2026.
   Arquitetura: dados.json (1 registro por processo) filtrado e agregado no
   cliente; mapa Leaflet auxiliar; gráficos ECharts. Determinístico, offline. */
'use strict';

/* ===================== paleta / constantes ===================== */
var NAVY='#272F68', NAVY3='#5E6AA6', LARANJA='#F4A44C';
var COR={ rascunho:'#B8BDC7', em_analise:'#E8A33D', devolvido:'#EC835A',
  excluido:'#A9683E', indeferido:'#C0392B', formalizacao:'#3D7BD1',
  transferido:'#1B7A4B', prestacao:'#0E5C3A', ocp:'#6B5CA5', outro:'#B8BDC7' };
var FUNIL=[
  {g:'rascunho',     lbl:'Rascunho (salvo, não enviado)'},
  {g:'em_analise',   lbl:'Em análise na SEDEC'},
  {g:'devolvido',    lbl:'Devolvido ao ente (ajustes)'},
  {g:'excluido',     lbl:'Excluído pelo ente'},
  {g:'indeferido',   lbl:'Indeferido pela SEDEC'},
  {g:'formalizacao', lbl:'Aprovado — em formalização'},
  {g:'transferido',  lbl:'Recurso transferido'},
  {g:'prestacao',    lbl:'Prestação de contas'},
  {g:'ocp',          lbl:'OCP — encaminhada ao Exército'}
];
var GLBL={}; FUNIL.forEach(function(f){GLBL[f.g]=f.lbl;});
var SUCESSO={transferido:1,formalizacao:1,prestacao:1};
var DIFIC={rascunho:1,excluido:1};   // "não avançou" — dificuldade do ente
var FASE_NAO='__sem__';              // sentinela: fase da ação não informada
var REG_COR={'Norte':'#2A78D6','Nordeste':'#EB6834','Centro-Oeste':'#1BAF7A',
  'Sudeste':'#8A6BD1','Sul':'#E87BA4'};
var RAMPA_NAVY=['#EDEFF7','#CBD2EA','#9FA9D2','#6E79B4','#454F8C','#272F68'];
var RAMPA_VERDE=['#E7F1EA','#BFDBC7','#8CBE9C','#57A074','#2E8354','#1B7A4B'];
var RAMPA_VERM=['#FBEDEA','#F4CBC0','#E89F8E','#DB705B','#C0392B','#8F241A'];
var MES_LBL=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

/* ===================== estado ===================== */
var S={ anos:[], dini:'', dfim:'', regiao:'', uf:'', mun:'', fase:'', fin:'', des:'', grupo:'',
        metUF:'vlib', metMapa:'vlib', sel:null, _scope:'br',
        ordCol:'vlib', ordDir:-1, tq:'' };  // anos:[]=todos · dini/dfim=intervalo · tq=busca no tabelão
var DADOS=null, META=null, UFGEO=null, ufFeats=[], BUSCA=[], NOME_MUN={};
var mapa, camadaUF=null, camadaMun=null, munCacheGeo={};
var chUF, chPz, chSit, chDes, chTempo, chDevol;

/* ===================== formatação ===================== */
function nfmt(n){ return (n||0).toLocaleString('pt-BR'); }
function reais(v){ return 'R$ '+(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function reaisC(v){ // compacto
  v=v||0; var s=v<0?'-':''; v=Math.abs(v);
  if(v>=1e9) return s+'R$ '+(v/1e9).toLocaleString('pt-BR',{maximumFractionDigits:2})+' bi';
  if(v>=1e6) return s+'R$ '+(v/1e6).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mi';
  if(v>=1e3) return s+'R$ '+(v/1e3).toLocaleString('pt-BR',{maximumFractionDigits:0})+' mil';
  return s+'R$ '+v.toLocaleString('pt-BR',{maximumFractionDigits:0});
}
function pct(n,d){ return d? (Math.round(1000*n/d)/10):0; }
function pfmt(n,d){ return d? pct(n,d).toLocaleString('pt-BR')+'%':'—'; }
function mediana(arr){ var a=arr.filter(function(x){return x!=null;}).sort(function(x,y){return x-y;});
  if(!a.length) return null; var m=Math.floor(a.length/2);
  return a.length%2? a[m] : Math.round((a[m-1]+a[m])/2); }
function pctl(arr,p){ var a=arr.filter(function(x){return x!=null;}).sort(function(x,y){return x-y;});
  if(!a.length) return null; var i=(a.length-1)*p, lo=Math.floor(i);
  return lo===i? a[lo] : Math.round(a[lo]+(a[lo+1]-a[lo])*(i-lo)); }
function media(arr){ var a=arr.filter(function(x){return x!=null;});
  return a.length? Math.round(a.reduce(function(x,y){return x+y;},0)/a.length):null; }
var PRAZO_SOLIC_LEGAL=90;   // dias — plano de trabalho p/ recuperação (Lei 12.340/12.608; Port. 3.033/2020)
function norm(s){ return (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }

/* ===================== carga ===================== */
function carrega(){
  Promise.all([
    fetch('dados/dados.json').then(function(r){return r.json();}),
    fetch('dados/uf.geojson').then(function(r){return r.json();})
  ]).then(function(res){
    DADOS=res[0].processos; META=res[0].meta; UFGEO=res[1]; ufFeats=UFGEO.features;
    document.getElementById('subTit').textContent=META.subtitulo;
    indiceBusca();
    montaFiltros(); iniciaMapa(); ligaEventos(); render();
    rodape();
  }).catch(function(e){
    document.getElementById('load').innerHTML='<span style="color:#C0392B">Erro ao carregar dados.<br>Abra via abrir_painel.bat (não file://).</span>';
    console.error(e);
  });
}

/* índice de busca: municípios (com processo) e UFs */
function indiceBusca(){
  var vis={};
  DADOS.forEach(function(p){ if(!p.cd) return; var k=p.cd;
    if(!vis[k]){ vis[k]={cd:p.cd, nome:p.mun, uf:p.uf, n:0}; } vis[k].n++; });
  BUSCA=Object.values(vis); BUSCA.forEach(function(m){ NOME_MUN[m.cd]=m.nome; });
  BUSCA.sort(function(a,b){ return b.n-a.n; });
}
function montaFiltros(){
  // botões de ano: Todos + 2016..2026 (multisseleção)
  var fa=document.getElementById('fAno');
  var bt='<button data-a="" class="on">Todos</button>';
  (META.anos||[]).forEach(function(a){ bt+='<button data-a="'+a+'">'+a+'</button>'; });
  fa.innerHTML=bt;
  var di=document.getElementById('fDini'), df=document.getElementById('fDfim');
  if(META.data_min){ di.min=df.min=META.data_min; di.max=df.max=META.data_max; }
  var uf=document.getElementById('fUF');
  META.ufs.forEach(function(u){ var o=document.createElement('option'); o.value=u; o.textContent=u; uf.appendChild(o); });
  var des=document.getElementById('fDes');
  META.desastres.slice().sort().forEach(function(d){ var o=document.createElement('option'); o.value=d; o.textContent=d; des.appendChild(o); });
}

/* ===================== filtro ===================== */
function filtra(){
  return DADOS.filter(function(p){
    if(S.anos.length && S.anos.indexOf(p.ano)<0) return false;
    if(S.dini && (!p.dprot || p.dprot<S.dini)) return false;
    if(S.dfim && (!p.dprot || p.dprot>S.dfim)) return false;
    if(S.regiao && p.rg!==S.regiao) return false;
    if(S.uf && p.uf!==S.uf) return false;
    if(S.mun && p.cd!==S.mun) return false;
    if(S.fase===FASE_NAO){ if(p.fac) return false; }
    else if(S.fase && p.fac!==S.fase) return false;
    if(S.fin && p.fin!==S.fin) return false;
    if(S.des && p.des!==S.des) return false;
    if(S.grupo && p.grp!==S.grupo) return false;
    return true;
  });
}

/* ===================== agregações ===================== */
function agrupa(arr, chave){
  var m={};
  arr.forEach(function(p){
    var k=p[chave]; if(k==null||k==='') return;
    if(!m[k]) m[k]={ k:k, n:0, fin:0, vlib:0, vsol:0, vcus:0, npes:0,
                      g:{}, transf:0, suc:0, efetiva:0, dific:0,
                      tsol:[], tana:[], tlib:[], muns:{} };
    var o=m[k]; o.n++; o.g[p.grp]=(o.g[p.grp]||0)+1;
    if(p.trilha==='Financeiro') o.fin++;
    o.vlib+=p.vlib||0; o.vsol+=p.vsol||0; o.vcus+=p.vcus||0; o.npes+=p.npes||0;
    if(p.grp==='transferido') o.transf++;
    if(SUCESSO[p.grp]) o.suc++;                 // acesso pleno (transf+formaliz+prestação)
    if(DIFIC[p.grp]) o.dific++;
    if(p.trilha==='Financeiro' && !DIFIC[p.grp]) o.efetiva++;
    if(p.tsol!=null) o.tsol.push(p.tsol);
    if(p.tana!=null) o.tana.push(p.tana);
    if(p.tlib!=null) o.tlib.push(p.tlib);
    if(p.cd) o.muns[p.cd]=1;
  });
  return m;
}
function sucessoDe(arr){ return arr.reduce(function(a,p){return a+(SUCESSO[p.grp]?1:0);},0); }
function efetivaDe(arr){ return arr.reduce(function(a,p){return a+((p.trilha==='Financeiro'&&!DIFIC[p.grp])?1:0);},0); }
function dificDe(arr){ return arr.reduce(function(a,p){return a+(DIFIC[p.grp]?1:0);},0); }
function finDe(arr){ return arr.reduce(function(a,p){return a+(p.trilha==='Financeiro'?1:0);},0); }

/* ===================== render principal ===================== */
function render(){
  var f=filtra();
  barraRecorte(f);
  kpis(f);
  funil(f);
  graficoTempo(f);
  graficoUF(f);
  graficoPrazos(f);
  graficoSit(f);
  graficoDevol(f);
  graficoDes(f);
  pintaMapa(f);
  destaques(f);
  narrativa(f);
  tabela(f);
}

/* ---------- barra de recorte + chips ---------- */
function barraRecorte(f){
  var loc = S.uf? '<b>'+S.uf+'</b>' : (S.regiao? '<b>'+S.regiao+'</b>' : '<b>Brasil</b>');
  document.getElementById('recorteTxt').innerHTML=loc+' · <b>'+anoTxt()+'</b> · '+nfmt(f.length)+' processos no recorte';
  var chips=[];
  function chip(campo,rot,val){ if(!val) return;
    chips.push('<span class="chip"><b>'+rot+':</b> '+val+' <button data-c="'+campo+'">×</button></span>'); }
  if(S.anos.length) chip('anos','Anos',S.anos.slice().sort().join(', '));
  if(S.dini||S.dfim) chip('periodo','Período',(S.dini?dbr(S.dini):'…')+' a '+(S.dfim?dbr(S.dfim):'…'));
  chip('regiao','Região',S.regiao); chip('uf','UF',S.uf);
  chip('mun','Município', S.mun? (NOME_MUN[S.mun]||S.mun):'');
  chip('fase','Fase',S.fase===FASE_NAO?'Não informada':S.fase);
  chip('fin','Finalidade',S.fin); chip('des','Desastre',S.des);
  chip('grupo','Situação',GLBL[S.grupo]);
  document.getElementById('recorteChips').innerHTML=chips.join('');
  document.querySelectorAll('.recorte-chips .chip button').forEach(function(b){
    b.onclick=function(){ setFiltro(b.getAttribute('data-c'),''); };
  });
}
/* rótulo do recorte temporal ativo */
function anoTxt(){
  if(S.dini||S.dfim) return (S.dini?dbr(S.dini):'início')+' a '+(S.dfim?dbr(S.dfim):'hoje');
  if(S.anos.length===1) return ''+S.anos[0];
  if(S.anos.length) return S.anos.slice().sort()[0]+'–'+S.anos.slice().sort().slice(-1)[0];
  var a=META.anos||[]; return a.length? a[0]+'–'+a[a.length-1] : '';
}
function anoSlug(){
  if(S.dini||S.dfim) return (S.dini||'ini')+'_a_'+(S.dfim||'fim');
  if(S.anos.length) return S.anos.slice().sort().join('-');
  var a=META.anos||[]; return a.length? a[0]+'-'+a[a.length-1] : 'todos';
}

/* ---------- KPIs ---------- */
function kpis(f){
  var vlib=f.reduce(function(a,p){return a+(p.vlib||0);},0);
  var vsol=f.reduce(function(a,p){return a+(p.vsol||0);},0);
  var suc=sucessoDe(f), efe=efetivaDe(f);
  var fin=finDe(f), dif=dificDe(f), ocp=f.length-fin;
  var medSol=mediana(f.map(function(p){return p.tsol;}));
  var medAna=mediana(f.map(function(p){return p.tana;}));
  var medLib=mediana(f.map(function(p){return p.tlib;}));
  var nMun=Object.keys(f.reduce(function(a,p){if(p.cd)a[p.cd]=1;return a;},{})).length;
  var subSedec='SEDEC: '+(medAna!=null?medAna+'d anál.':'—')+' · '+(medLib!=null?medLib+'d liber.':'—');
  var K=[
    ['','v', reaisC(vlib), 'Recurso liberado', suc+' processos com repasse'],
    ['k-laranja','v', reaisC(vsol), 'Valor solicitado', 'demanda dos entes'],
    ['','v', nfmt(f.length), 'Processos', nMun+' municípios'+(ocp?' · '+nfmt(ocp)+' via OCP':'')],
    ['k-verde','v', pfmt(suc,efe), 'Acesso ao recurso', suc+' de '+efe+' analisados pela SEDEC'],
    ['k-vermelho','v', pfmt(dif,fin), 'Dificuldade do ente', dif+' rascunhos/excluídos'],
    ['','v', (medSol!=null?nfmt(medSol):'—')+'<small style="font-size:12px"> d</small>', 'Prazo do ente (mediana)', subSedec]
  ];
  document.getElementById('kpis').innerHTML=K.map(function(k){
    return '<div class="kpi '+k[0]+'"><div class="v">'+k[2]+'</div><div class="r">'+k[3]+'</div><div class="sub">'+k[4]+'</div></div>';
  }).join('');
}

/* ---------- funil de admissibilidade ---------- */
function funil(f){
  var cont={}; FUNIL.forEach(function(x){cont[x.g]={n:0,v:0};});
  f.forEach(function(p){ if(!cont[p.grp])cont[p.grp]={n:0,v:0}; cont[p.grp].n++; cont[p.grp].v+=p.vlib||0; });
  var max=Math.max(1,...FUNIL.map(function(x){return cont[x.g].n;}));
  var tot=f.length||1;
  var html=FUNIL.map(function(x){
    var c=cont[x.g], sel=S.grupo===x.g?' sel':'';
    return '<div class="funil-row'+sel+'" data-g="'+x.g+'">'+
      '<div class="funil-lbl"><span class="funil-dot" style="background:'+COR[x.g]+'"></span>'+x.lbl+'</div>'+
      '<div class="funil-bar"><i style="width:'+(100*c.n/max)+'%;background:'+COR[x.g]+'"></i></div>'+
      '<div class="funil-val"><b>'+nfmt(c.n)+'</b> ('+pfmt(c.n,tot)+')'+(c.v>0?' · '+reaisC(c.v):'')+'</div></div>';
  }).join('');
  document.getElementById('funil').innerHTML=html;
  document.querySelectorAll('#funil .funil-row').forEach(function(r){
    r.onclick=function(){ var g=r.getAttribute('data-g'); setFiltro('grupo', S.grupo===g?'':g); };
  });
  var ocp=(META.n_ocp)||0;
  document.getElementById('dicaFunil').innerHTML=
    'Leitura neutra/diagnóstica. <b>Rascunho</b> e <b>excluído pelo ente</b> (muitos sem nº de '+
    'processo) sinalizam dificuldade do município em cadastrar/levar adiante a solicitação. '+
    '<b>Indeferido</b> é decisão da SEDEC. '+
    (ocp? '<br><i>OCP ('+nfmt(ocp)+'): Operação Carro Pipa, encaminhada ao Exército — entra na '+
      'contagem, mas fica fora dos indicadores financeiros.</i>':'');
}

/* ---------- ranking: recursos por UF (→ municípios ao entrar numa UF) ---------- */
function graficoUF(f){
  var porUF=!S.uf, met=S.metUF;
  var m=agrupa(f, porUF?'uf':'cd');
  var arr=Object.values(m).map(function(o){ return {k:o.k, nome:porUF?o.k:(NOME_MUN[o.k]||o.k),
      val: met==='vlib'?o.vlib:o.n, o:o}; })
    .filter(function(o){return o.val>0;}).sort(function(a,b){return b.val-a.val;});
  document.getElementById('tituloUF').textContent =
    porUF? 'Recursos por Unidade da Federação' : 'Recursos por município — '+S.uf;
  var cats=arr.map(function(o,i){return (i+1)+'. '+o.nome;});   // posição no ranking
  var el=document.getElementById('chartUF');
  el.style.height = Math.max(160, arr.length*22 + 26) + 'px';
  if(chUF){try{chUF.dispose();}catch(e){}} chUF=echarts.init(el);
  chUF.setOption({
    grid:{left:6,right:70,top:6,bottom:6,containLabel:true},
    xAxis:{type:'value',show:false},
    yAxis:{type:'category',inverse:true,data:cats,axisTick:{show:false},axisLine:{show:false},
      axisLabel:{color:'#5B6068',fontSize:11,fontWeight:500}},
    tooltip:{trigger:'axis',axisPointer:{type:'shadow'},
      formatter:function(p){var o=arr[p[0].dataIndex];
        return '<b>'+(p[0].dataIndex+1)+'. '+o.nome+'</b><br>Liberado: '+reais(o.o.vlib)+
          '<br>Processos: '+nfmt(o.o.n);}},
    series:[{type:'bar',data:arr.map(function(o){return o.val;}),
      itemStyle:{color:met==='vlib'?NAVY:NAVY3,borderRadius:[0,3,3,0]},barMaxWidth:14,
      label:{show:true,position:'right',color:'#5B6068',fontSize:10,
        formatter:function(p){var o=arr[p.dataIndex];return met==='vlib'?reaisC(o.val):nfmt(o.val);}}}]
  });
  chUF.off('click'); chUF.on('click',function(p){ var o=arr[p.dataIndex]; if(!o) return;
    if(porUF) setFiltro('uf',o.k); else setFiltro('mun', S.mun===o.k?'':o.k); });
  document.getElementById('dicaUF').innerHTML =
    (porUF? 'Todas as UFs' : 'Todos os municípios de '+S.uf)+' com registro, em ordem decrescente. '+
    'Clique para filtrar · role para ver a lista completa.';
}

/* ---------- gráfico: prazos (mediana + p90, com referência legal) ---------- */
function graficoPrazos(f){
  function stat(campo){ var v=f.map(function(p){return p[campo];}).filter(function(x){return x!=null;});
    return {n:v.length, med:mediana(v), p90:pctl(v,.9), avg:media(v), max:v.length?Math.max.apply(null,v):null}; }
  var st=[stat('tsol'),stat('tana'),stat('tlib')];
  var cats=['Solicitação\n(ente)','Análise\n(SEDEC)','Liberação\n(SEDEC)'];
  // % das solicitações do ente dentro do prazo legal de 90 dias
  var vsol=f.map(function(p){return p.tsol;}).filter(function(x){return x!=null;});
  var dentro=vsol.length? Math.round(100*vsol.filter(function(x){return x<=PRAZO_SOLIC_LEGAL;}).length/vsol.length):null;
  var el=document.getElementById('chartPrazos');
  if(chPz){try{chPz.dispose();}catch(e){}} chPz=echarts.init(el);
  chPz.setOption({
    grid:{left:10,right:14,top:30,bottom:32,containLabel:true},
    legend:{data:['Mediana','p90'],top:0,right:0,textStyle:{color:'#5B6068',fontSize:11},itemWidth:12,itemHeight:8},
    tooltip:{trigger:'axis',axisPointer:{type:'shadow'},formatter:function(ps){var i=ps[0].dataIndex,o=st[i];
      return '<b>'+cats[i].replace('\n',' ')+'</b><br>Mediana: '+(o.med!=null?o.med+'d':'—')+
        '<br>p90: '+(o.p90!=null?o.p90+'d':'—')+'<br>Média: '+(o.avg!=null?o.avg+'d':'—')+
        ' · Máx: '+(o.max!=null?o.max+'d':'—')+'<br>n = '+nfmt(o.n)+' processos';}},
    xAxis:{type:'category',data:cats,axisTick:{show:false},axisLine:{lineStyle:{color:'#C3C2B7'}},
      axisLabel:{color:'#5B6068',fontSize:10.5,lineHeight:13}},
    yAxis:{type:'value',name:'dias',nameTextStyle:{color:'#8A9099',fontSize:10},
      splitLine:{lineStyle:{color:'#EEF1F6'}},axisLabel:{color:'#8A9099',fontSize:10}},
    series:[
      {name:'Mediana',type:'bar',data:st.map(function(o){return o.med;}),
        itemStyle:{color:NAVY,borderRadius:[3,3,0,0]},barMaxWidth:26,
        label:{show:true,position:'top',color:'#22252E',fontWeight:700,fontSize:11,formatter:function(p){return p.value==null?'':p.value+'d';}},
        markLine:{silent:true,symbol:'none',data:[{yAxis:PRAZO_SOLIC_LEGAL}],
          lineStyle:{color:'#C0392B',type:'dashed',width:1.5},
          label:{formatter:'prazo legal 90d (recuperação)',color:'#C0392B',fontSize:9.5,position:'insideEndTop'}}},
      {name:'p90',type:'bar',data:st.map(function(o){return o.p90;}),
        itemStyle:{color:'#9FA9D2',borderRadius:[3,3,0,0]},barMaxWidth:26,
        label:{show:true,position:'top',color:'#5B6068',fontSize:10,formatter:function(p){return p.value==null?'':p.value+'d';}}}]
  });
  document.getElementById('dicaPrazos').innerHTML=
    (dentro!=null? '<b>'+dentro+'%</b> das solicitações do ente foram enviadas em até <b>90 dias</b> do desastre '+
      '(prazo legal do plano de trabalho de recuperação — Lei 12.340/2010 e Portaria 3.033/2020; '+
      'dispensado no socorro/assistência imediatos). ':'')+
    '<b>p90</b> = 90% dos casos ficaram até esse valor (revela a cauda). '+
    'A <b>análise e a liberação da SEDEC não têm prazo legal expresso</b> — mostradas apenas de forma descritiva.';
}

/* ---------- gráfico: situação (donut) ---------- */
function graficoSit(f){
  var cont={}; f.forEach(function(p){cont[p.grp]=(cont[p.grp]||0)+1;});
  var tot=f.length||1;
  var data=FUNIL.filter(function(x){return cont[x.g];}).map(function(x){
    return {name:x.lbl, value:cont[x.g], itemStyle:{color:COR[x.g]}}; });
  var pctMap={}; data.forEach(function(d){ pctMap[d.name]=pct(d.value,tot); });
  var el=document.getElementById('chartSit');
  if(chSit){try{chSit.dispose();}catch(e){}} chSit=echarts.init(el);
  chSit.setOption({
    tooltip:{trigger:'item',formatter:function(p){return '<b>'+p.name+'</b><br>'+nfmt(p.value)+' ('+p.percent+'%)';}},
    legend:{type:'scroll',orient:'vertical',right:0,top:'center',icon:'roundRect',
      textStyle:{color:'#5B6068',fontSize:10.5},itemWidth:11,itemHeight:11,itemGap:6,
      formatter:function(name){ var v=pctMap[name]; return name+'  '+(v!=null? v.toLocaleString('pt-BR')+'%':''); }},
    series:[{type:'pie',radius:['46%','72%'],center:['30%','50%'],avoidLabelOverlap:true,
      label:{show:true,position:'inside',formatter:function(p){return p.percent>=5? Math.round(p.percent)+'%':'';},
        color:'#fff',fontSize:9,fontWeight:700},labelLine:{show:false},data:data,
      emphasis:{scale:true,scaleSize:5}}]
  });
  chSit.off('click'); chSit.on('click',function(p){
    var g=FUNIL.filter(function(x){return x.lbl===p.name;})[0];
    if(g) setFiltro('grupo', S.grupo===g.g?'':g.g); });
}

/* ---------- gráfico: por tipo de desastre ---------- */
function graficoDes(f){
  var m=agrupa(f,'des');
  var arr=Object.values(m).sort(function(a,b){return b.n-a.n;}).slice(0,10).reverse();
  var el=document.getElementById('chartDes');
  if(chDes){try{chDes.dispose();}catch(e){}} chDes=echarts.init(el);
  chDes.setOption({
    grid:{left:8,right:64,top:24,bottom:8,containLabel:true},
    legend:{data:['Processos','R$ liberado'],top:0,right:0,textStyle:{color:'#5B6068',fontSize:11},
      itemWidth:12,itemHeight:12},
    tooltip:{trigger:'axis',axisPointer:{type:'shadow'},
      formatter:function(ps){var o=arr[ps[0].dataIndex];
        return '<b>'+o.k+'</b><br>Processos: '+nfmt(o.n)+'<br>Liberado: '+reais(o.vlib);}},
    xAxis:[{type:'value',show:false},{type:'value',show:false}],
    yAxis:{type:'category',data:arr.map(function(o){return o.k.length>34?o.k.slice(0,32)+'…':o.k;}),
      axisTick:{show:false},axisLine:{show:false},axisLabel:{color:'#5B6068',fontSize:10.5}},
    series:[
      {name:'Processos',type:'bar',xAxisIndex:0,data:arr.map(function(o){return o.n;}),
        itemStyle:{color:NAVY3,borderRadius:[0,3,3,0]},barMaxWidth:9,barGap:'20%',
        label:{show:true,position:'right',color:'#5B6068',fontSize:10,formatter:function(p){return nfmt(arr[p.dataIndex].n);}}},
      {name:'R$ liberado',type:'bar',xAxisIndex:1,data:arr.map(function(o){return o.vlib;}),
        itemStyle:{color:'#1B7A4B',borderRadius:[0,3,3,0]},barMaxWidth:9,
        label:{show:true,position:'right',color:'#1B7A4B',fontSize:10,formatter:function(p){return arr[p.dataIndex].vlib>0?reaisC(arr[p.dataIndex].vlib):'';}}}]
  });
  chDes.off('click'); chDes.on('click',function(p){ setFiltro('des', arr[p.dataIndex].k); });
}

/* ---------- gráfico: evolução mensal ---------- */
function mesDe(iso){ return (iso && iso.length>=7)? parseInt(iso.slice(5,7),10)-1 : -1; }
function graficoTempo(f){
  var pres={}; f.forEach(function(p){ if(p.ano) pres[p.ano]=1; });
  var listaAnos=Object.keys(pres).map(Number).sort(function(a,b){return a-b;});
  var mensal = listaAnos.length<=1;
  var cats, sol, lib, sufixo, granul;
  if(mensal){
    var ano = listaAnos[0] || S.anos[0] || null;
    sol=new Array(12).fill(0); lib=new Array(12).fill(0);
    f.forEach(function(p){ var ms=mesDe(p.dsol); if(ms>=0) sol[ms]++;
      var ml=mesDe(p.dlib); if(ml>=0 && p.vlib) lib[ml]++; });
    var ult=0; for(var i=0;i<12;i++){ if(sol[i]||lib[i]) ult=i; }
    cats=MES_LBL.slice(0,ult+1); sol=sol.slice(0,ult+1); lib=lib.slice(0,ult+1);
    sufixo = ano? (' — '+ano):''; granul = ano? ('/'+ano):'';
  } else {
    var a0=listaAnos[0], a1=listaAnos[listaAnos.length-1];
    cats=[]; for(var y=a0;y<=a1;y++) cats.push(''+y);
    var si={}, li={};
    f.forEach(function(p){ var ys=p.dsol&&p.dsol.slice(0,4); if(ys) si[ys]=(si[ys]||0)+1;
      var yl=p.dlib&&p.dlib.slice(0,4); if(yl&&p.vlib) li[yl]=(li[yl]||0)+1; });
    sol=cats.map(function(y){return si[y]||0;}); lib=cats.map(function(y){return li[y]||0;});
    sufixo=' — '+a0+'–'+a1; granul='';
  }
  var tt=document.getElementById('tituloTempo');
  if(tt) tt.textContent=(mensal?'Evolução mensal':'Evolução anual')+sufixo;
  var el=document.getElementById('chartTempo');
  if(chTempo){try{chTempo.dispose();}catch(e){}} chTempo=echarts.init(el);
  chTempo.setOption({
    grid:{left:8,right:14,top:30,bottom:20,containLabel:true},
    legend:{data:['Solicitações do ente','Processos com liberação'],top:0,right:0,
      textStyle:{color:'#5B6068',fontSize:11},itemWidth:14,itemHeight:8},
    tooltip:{trigger:'axis',formatter:function(ps){ var h='<b>'+ps[0].axisValue+granul+'</b>';
      ps.forEach(function(x){h+='<br>'+x.marker+x.seriesName+': <b>'+nfmt(x.value)+'</b>';}); return h; }},
    xAxis:{type:'category',data:cats,boundaryGap:false,axisTick:{show:false},
      axisLine:{lineStyle:{color:'#C3C2B7'}},axisLabel:{color:'#8A9099',fontSize:10.5}},
    yAxis:{type:'value',name:'nº de processos',nameTextStyle:{color:'#8A9099',fontSize:10},
      splitLine:{lineStyle:{color:'#EEF1F6'}},axisLabel:{color:'#8A9099',fontSize:10}},
    series:[
      {name:'Solicitações do ente',type:'line',smooth:true,data:sol,
        symbol:'circle',symbolSize:7,lineStyle:{width:2,color:LARANJA},itemStyle:{color:LARANJA},
        areaStyle:{color:'rgba(244,164,76,.12)'}},
      {name:'Processos com liberação',type:'line',smooth:true,data:lib,
        symbol:'circle',symbolSize:7,lineStyle:{width:2,color:'#1B7A4B'},itemStyle:{color:'#1B7A4B'},
        areaStyle:{color:'rgba(27,122,75,.10)'}}]
  });
}

/* ---------- gráfico: dificuldade do ente (Brasil→UF→municípios) ---------- */
function graficoDevol(f){
  var porUF = !S.uf;
  var m=agrupa(f, porUF?'uf':'cd');
  var arr=Object.values(m).filter(function(o){return o.fin>=1;}).map(function(o){
    return {k:o.k, nome: porUF? o.k : (NOME_MUN[o.k]||o.k), fin:o.fin,
      ente:pct((o.g.rascunho||0)+(o.g.excluido||0), o.fin),
      ind:pct(o.g.indeferido||0, o.fin)}; })
    .sort(function(a,b){return (b.ente-a.ente) || (b.ind-a.ind) || (b.fin-a.fin);});
  document.getElementById('tituloDevol').textContent =
    porUF? 'Dificuldade do ente — por UF' : 'Dificuldade do ente — municípios de '+S.uf;
  // altura dinâmica → rolagem vertical no container (.ech-scroll)
  var el=document.getElementById('chartDevol');
  el.style.height = Math.max(180, arr.length*22 + 42) + 'px';
  if(chDevol){try{chDevol.dispose();}catch(e){}} chDevol=echarts.init(el);
  chDevol.setOption({
    grid:{left:8,right:44,top:28,bottom:6,containLabel:true},
    legend:{data:['Não avançou (ente)','Indeferido (SEDEC)'],top:0,right:0,
      textStyle:{color:'#5B6068',fontSize:11},itemWidth:12,itemHeight:12},
    tooltip:{trigger:'axis',axisPointer:{type:'shadow'},
      formatter:function(ps){ var o=arr[ps[0].dataIndex];
        return '<b>'+o.nome+'</b><br>Não avançou (rascunho/excluído): '+o.ente+'%<br>'+
          'Indeferido pela SEDEC: '+o.ind+'%<br>'+nfmt(o.fin)+' processos financeiros'; }},
    xAxis:{type:'value',show:false,max:100},
    yAxis:{type:'category',inverse:true,data:arr.map(function(o){return o.nome;}),axisTick:{show:false},
      axisLine:{show:false},axisLabel:{color:'#5B6068',fontSize:11,fontWeight:500}},
    series:[
      {name:'Não avançou (ente)',type:'bar',stack:'x',data:arr.map(function(o){return o.ente;}),
        itemStyle:{color:COR.excluido},barMaxWidth:14},
      {name:'Indeferido (SEDEC)',type:'bar',stack:'x',data:arr.map(function(o){return o.ind;}),
        itemStyle:{color:COR.indeferido},barMaxWidth:14,
        label:{show:true,position:'right',color:'#5B6068',fontSize:10,
          formatter:function(p){var o=arr[p.dataIndex];return (o.ente+o.ind)+'%';}}}]
  });
  chDevol.off('click'); chDevol.on('click',function(p){ var o=arr[p.dataIndex]; if(!o) return;
    if(porUF) setFiltro('uf',o.k); else setFiltro('mun', S.mun===o.k?'':o.k); });
  document.getElementById('dicaDevol').innerHTML=
    '% sobre os processos financeiros '+(porUF?'de cada UF':'de cada município de '+S.uf)+' (exclui OCP). '+
    '<b>Não avançou</b> = rascunho salvo ou excluído pelo ente (dificuldade do ente); '+
    '<b>indeferido</b> = negado pela SEDEC. Clique para filtrar · role para ver '+(porUF?'todas as UFs':'todos os municípios')+'.';
}

/* ===================== mapa (geovisualizador-lite) ===================== */
var basemaps, opFillTiles=true;   // padrão = satélite (com tiles)
function opFill(base){ return opFillTiles? 0.62 : (base==='mun'?0.9:0.85); }
function iniciaMapa(){
  var esri=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {maxZoom:19,attribution:'Imagens © Esri, Maxar'});
  var ruas=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {maxZoom:19,attribution:'© OpenStreetMap'});
  var claro=L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    {maxZoom:19,subdomains:'abcd',attribution:'© OpenStreetMap · © CARTO'});
  var sem=L.layerGroup();
  basemaps={'Satélite (online)':esri,'Ruas (online)':ruas,'Claro (online)':claro,'Sem fundo (offline)':sem};
  mapa=L.map('mapa',{zoomControl:false,attributionControl:true,preferCanvas:true,
    minZoom:3,maxZoom:11,layers:[esri]}).setView([-15.3,-53],3.4);
  mapa.attributionControl.setPrefix('S2iD/SEDEC · IBGE');
  L.control.layers(basemaps,null,{position:'topright',collapsed:true}).addTo(mapa);
  L.control.zoom({position:'topright'}).addTo(mapa);
  addHome('topright'); addNorte('topright'); addExportMapa('topright');
  L.control.scale({metric:true,imperial:false,position:'bottomleft',maxWidth:150}).addTo(mapa);
  mapa.on('baselayerchange',function(e){ opFillTiles=(e.name.indexOf('offline')<0); pintaMapa(filtra()); });
  document.getElementById('load').style.display='none';
}
function ctlBar(pos,html,onclick,title){
  var C=L.Control.extend({options:{position:pos||'topright'},onAdd:function(){
    var d=L.DomUtil.create('a','leaflet-bar ctl-btn'); d.href='#'; d.title=title||''; d.innerHTML=html;
    L.DomEvent.on(d,'click',function(e){ L.DomEvent.stop(e); onclick(); }); return d; }});
  new C().addTo(mapa);
}
function addHome(pos){ ctlBar(pos,'⌂',function(){ reenquadraMapa(); },'Voltar ao enquadramento total'); }
function addNorte(pos){
  var C=L.Control.extend({options:{position:pos||'topright'},onAdd:function(){
    var d=L.DomUtil.create('div','leaflet-bar ctl-norte');
    d.innerHTML='<svg viewBox="0 0 40 40"><polygon points="20,4 27,32 20,25 13,32" fill="#272F68"/>'+
      '<polygon points="20,4 20,25 13,32" fill="#F4A44C"/>'+
      '<text x="20" y="39" text-anchor="middle" font-size="10" fill="#272F68" font-weight="700">N</text></svg>';
    return d; }});
  new C().addTo(mapa);
}
function reenquadraMapa(){
  if(S.uf && camadaMun){ try{ mapa.fitBounds(camadaMun.getBounds(),{padding:[10,10]}); return; }catch(e){} }
  mapa.setView([-15.3,-53],3.4);
}
function addExportMapa(pos){
  var C=L.Control.extend({options:{position:pos||'topright'},onAdd:function(){
    var d=L.DomUtil.create('div','leaflet-bar leaflet-control exp-ctl');
    d.innerHTML='<a class="ctl-btn" id="btnExpMapa" href="#" title="Exportar camada do recorte">'+
      '<svg viewBox="0 0 24 24"><path d="M12 3v11m0 0l-4.2-4.2M12 14l4.2-4.2M4.5 19.5h15" fill="none" '+
      'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>'+
      '<div class="exp-panel" id="expMapaPanel">'+
        '<div class="exp-tit">Camada geográfica do recorte</div>'+
        '<button data-g="geojson">🌐 GeoJSON</button>'+
        '<button data-g="kmz">🗺️ KMZ (Google Earth)</button>'+
        '<div class="exp-nota">Polígonos (IBGE) do recorte atual com os indicadores como atributos.</div>'+
      '</div>';
    L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
    return d; }});
  new C().addTo(mapa);
  var tog=document.getElementById('btnExpMapa'), pan=document.getElementById('expMapaPanel');
  L.DomEvent.on(tog,'click',function(e){ L.DomEvent.stop(e); });   // hover abre; clique não navega
  pan.querySelectorAll('button').forEach(function(b){ b.onclick=function(){
    exportaGeo(b.getAttribute('data-g')); }; });
}
function ehPct(met){ return met==='taxa'||met==='dific'; }
function rampaDe(met){ return met==='taxa'?RAMPA_VERDE : met==='dific'?RAMPA_VERM : RAMPA_NAVY; }
function valorMapa(o,met){
  if(met==='taxa') return pct(o.suc,o.efetiva);
  if(met==='dific') return pct((o.g.rascunho||0)+(o.g.excluido||0), o.fin);
  if(met==='vlib') return o.vlib;
  return o.n;
}
function corEscala(val,max,met){
  if(val==null||(!ehPct(met)&&max<=0)) return '#EDEFF6';
  var r=rampaDe(met); var t=ehPct(met)? val/100 : val/max;
  var i=Math.min(r.length-1, Math.floor(t*r.length)); return r[Math.max(0,i)];
}
function pintaMapa(f){
  if(!mapa) return;
  if(camadaUF){mapa.removeLayer(camadaUF);camadaUF=null;}
  if(camadaMun){mapa.removeLayer(camadaMun);camadaMun=null;}
  var met=S.metMapa;
  var escopo = S.uf || 'br';
  var mudouEscopo = (escopo!==S._scope); S._scope=escopo;
  if(S.uf){ pintaMun(f,met,mudouEscopo); document.getElementById('tituloMapa').textContent='Mapa — municípios de '+S.uf; }
  else { pintaUF(f,met,mudouEscopo); document.getElementById('tituloMapa').textContent='Mapa de distribuição por UF'; }
}
function pintaUF(f,met,reenquadra){
  var m=agrupa(f,'uf');
  var vals=Object.values(m).map(function(o){return valorMapa(o,met);});
  var max=Math.max.apply(null,vals.concat([0]));
  camadaUF=L.geoJSON(UFGEO,{
    style:function(ft){ var o=m[ft.properties.uf];
      var v=o? valorMapa(o,met) : null;
      return {fillColor:corEscala(v,max,met),fillOpacity:o?opFill('uf'):.25,color:'#fff',weight:1}; },
    onEachFeature:function(ft,ly){ var o=m[ft.properties.uf];
      ly.on('mouseover',function(){ly.setStyle({weight:2,color:NAVY});ly.bringToFront();tipUF(ft,o,ly);});
      ly.on('mouseout',function(){camadaUF.resetStyle(ly);ly.closeTooltip();});
      ly.on('click',function(){ setFiltro('uf', ft.properties.uf); });
    }
  }).addTo(mapa);
  // ao voltar do drill municipal, reenquadra o Brasil (setView é determinístico)
  if(reenquadra){ try{ mapa.setView([-15.3,-53],3.4); }catch(e){} }
  legenda(max,met);
}
function tipUF(ft,o,ly){
  var p=ft.properties;
  var h='<div class="tt-nome">'+p.nm+' ('+p.uf+')</div>';
  if(o){ h+=linhaTT('Processos',nfmt(o.n)+(o.n-o.fin>0?' ('+nfmt(o.n-o.fin)+' OCP)':''));
    h+=linhaTT('Recurso liberado',reaisC(o.vlib));
    h+=linhaTT('Acesso ao recurso',pfmt(o.suc,o.efetiva));
    h+=linhaTT('Dificuldade do ente',pfmt(o.dific,o.fin)); }
  else h+='<div class="tt-linha"><span>sem processos no recorte</span></div>';
  ly.bindTooltip(h,{className:'map-tip',sticky:true}).openTooltip();
}
function linhaTT(r,v){ return '<div class="tt-linha"><span>'+r+'</span><b>'+v+'</b></div>'; }
function pintaMun(f,met,reenquadra){
  var uf=S.uf;
  function desenha(geo){
    var m=agrupa(f,'cd');
    var vals=Object.values(m).map(function(o){return valorMapa(o,met);});
    var max=Math.max.apply(null,vals.concat([0]));
    camadaMun=L.geoJSON(geo,{
      style:function(ft){ var o=m[ft.properties.cd];
        var v=o? valorMapa(o,met) : null;
        return {fillColor:o?corEscala(v,max,met):'#F3F5F9',fillOpacity:o?opFill('mun'):.35,color:'#fff',weight:.6}; },
      onEachFeature:function(ft,ly){ var o=m[ft.properties.cd];
        ly.on('mouseover',function(){ly.setStyle({weight:1.6,color:NAVY});ly.bringToFront();
          var p=ft.properties,h='<div class="tt-nome">'+p.nm+'</div>';
          if(o){h+=linhaTT('Processos',nfmt(o.n));h+=linhaTT('Liberado',reaisC(o.vlib));
            h+=linhaTT('Dificuldade',pfmt(o.dific,o.fin));}
          else h+='<div class="tt-linha"><span>sem processos</span></div>';
          ly.bindTooltip(h,{className:'map-tip',sticky:true}).openTooltip();});
        ly.on('mouseout',function(){camadaMun.resetStyle(ly);ly.closeTooltip();});
        ly.on('click',function(){ if(o) setFiltro('mun', ft.properties.cd); });
      }
    }).addTo(mapa);
    if(reenquadra){ try{ mapa.fitBounds(camadaMun.getBounds(),{padding:[10,10]}); }catch(e){} }
    legenda(max,met);
  }
  if(munCacheGeo[uf]) desenha(munCacheGeo[uf]);
  else fetch('dados/mun/'+uf+'.geojson').then(function(r){return r.json();})
        .then(function(g){munCacheGeo[uf]=g;desenha(g);})
        .catch(function(){});
}
function legenda(max,met){
  var r=rampaDe(met), el=document.getElementById('mapaLeg');
  var rot = met==='taxa'?'Acesso ao recurso (%)' : met==='dific'?'Dificuldade do ente — % rascunho/excluído'
          : met==='vlib'?'Recurso liberado' : 'Nº de processos';
  var passos=r.map(function(c,i){
    if(ehPct(met)){ var lo=Math.round(100*i/r.length), hi=Math.round(100*(i+1)/r.length);
      return '<span class="lg"><i class="sw" style="background:'+c+'"></i>'+lo+'–'+hi+'</span>'; }
    var b=max*(i+1)/r.length;
    var lab= met==='vlib'? reaisC(b) : Math.round(b);
    return '<span class="lg"><i class="sw" style="background:'+c+'"></i>≤'+lab+'</span>';
  });
  el.innerHTML='<span style="width:100%;font-weight:700;color:#5B6068">'+rot+'</span>'+passos.join('');
}

/* ===================== destaques do recorte ===================== */
function destaques(f){
  var porUF=!S.uf;
  var esc = porUF? (S.regiao?'na região':'no Brasil') : 'em '+S.uf;
  document.getElementById('destTit').textContent = 'Destaques — '+(porUF?(S.regiao||'Brasil'):'municípios de '+S.uf);
  var arr=Object.values(agrupa(f, porUF?'uf':'cd'));
  function nome(o){ return porUF? o.k : (NOME_MUN[o.k]||o.k); }
  function topo(pred, val){ var a=arr.filter(pred); if(!a.length) return null;
    a.sort(function(x,y){return val(y)-val(x);}); return a[0]; }
  var items=[];
  var tLib=topo(function(o){return o.vlib>0;}, function(o){return o.vlib;});
  if(tLib) items.push(['💰','k-verde','Maior repasse',nome(tLib),reaisC(tLib.vlib)]);
  var tN=topo(function(o){return o.n>0;}, function(o){return o.n;});
  if(tN) items.push(['📋','','Mais processos',nome(tN),nfmt(tN.n)]);
  var tDif=topo(function(o){return o.fin>=3;}, function(o){return pct(o.dific,o.fin);});
  if(tDif) items.push(['⚠️','k-vermelho','Maior dificuldade do ente',nome(tDif),pfmt(tDif.dific,tDif.fin)]);
  var tSol=topo(function(o){return o.tsol.length>=3;}, function(o){return mediana(o.tsol);});
  if(tSol) items.push(['⏱️','','Maior prazo do ente (mediana)',nome(tSol),nfmt(mediana(tSol.tsol))+' d']);
  var cor={'k-verde':'#E7F1EA','k-vermelho':'#FBEDEA','':'#EEF1F6'};
  document.getElementById('destaques').innerHTML = items.length? items.map(function(it){
    return '<div class="dest-item"><div class="dest-ic" style="background:'+cor[it[1]]+'">'+it[0]+'</div>'+
      '<div class="dest-txt"><div class="dest-lbl">'+it[2]+'</div><div class="dest-nome">'+it[3]+'</div></div>'+
      '<div class="dest-val">'+it[4]+'</div></div>'; }).join('')
    : '<div style="color:#8A9099;font-size:12px;padding:8px">Sem dados no recorte.</div>';
}

/* ===================== narrativa ===================== */
function narrativa(f){
  var esc = (S.mun? (NOME_MUN[S.mun]||S.mun)+'/'+S.uf : (S.uf||S.regiao||'Brasil'));
  var vlib=f.reduce(function(a,p){return a+(p.vlib||0);},0);
  var suc=sucessoDe(f), efe=efetivaDe(f), dif=dificDe(f), fin=finDe(f);
  var medSol=mediana(f.map(function(p){return p.tsol;}));
  var t='No recorte <b>'+esc+'</b>, foram registrados <b>'+nfmt(f.length)+'</b> processos de resposta';
  if(vlib>0) t+=', com <span class="real">'+reaisC(vlib)+'</span> em recursos federais liberados';
  t+='. ';
  if(efe>0) t+='Das '+nfmt(efe)+' solicitações analisadas pela SEDEC, <b>'+pfmt(suc,efe)+'</b> chegaram ao repasse. ';
  if(dif>0) t+='<b>'+nfmt(dif)+'</b> processos ('+pfmt(dif,fin)+' dos financeiros) ficaram em rascunho ou '+
    'foram excluídos pelo ente — sinal de dificuldade em cadastrar/levar adiante a solicitação. ';
  if(medSol!=null) t+='O tempo mediano entre o desastre e a solicitação do ente foi de <b>'+nfmt(medSol)+' dias</b>.';
  document.getElementById('narrTit').textContent='Síntese — '+esc;
  document.getElementById('narr').innerHTML=t;
}

/* ===================== tabelão (detalhamento) ===================== */
var COLS=[
  {k:'prot',l:'Protocolo',t:'t'}, {k:'uf',l:'UF',t:'t'}, {k:'mun',l:'Município',t:'t'},
  {k:'des',l:'Desastre',t:'t'}, {k:'fac',l:'Fase',t:'t'}, {k:'sit',l:'Situação',t:'s'},
  {k:'vsol',l:'Solicitado',t:'r'}, {k:'vlib',l:'Liberado',t:'r'},
  {k:'dcri',l:'Criação',t:'d'}, {k:'dsol',l:'Solicitação',t:'d'},
  {k:'ddes',l:'Data desastre',t:'d'}, {k:'dlib',l:'Liberação',t:'d'},
  {k:'tsol',l:'Dias ente',t:'n'}, {k:'tana',l:'Dias análise',t:'n'}, {k:'tlib',l:'Dias liber.',t:'n'},
  {k:'proc',l:'Processo',t:'t'}
];
function dbr(iso){ return iso? iso.split('-').reverse().join('/') : '—'; }
function fmtCel(p,c){
  var v=p[c.k];
  if(c.t==='r') return v?reaisC(v):'—';
  if(c.t==='n') return v!=null?nfmt(v):'—';
  if(c.t==='d') return dbr(v);
  if(c.t==='s') return '<span class="funil-dot" style="display:inline-block;vertical-align:middle;background:'+(COR[p.grp]||'#ccc')+'"></span> '+(v||'—');
  return v||'—';
}
function tabela(f){
  var dir=S.ordDir, col=S.ordCol;
  var base=f, q=norm(S.tq||'');
  if(q){ base=f.filter(function(p){
    return norm(p.prot).indexOf(q)>=0 || norm(p.proc).indexOf(q)>=0 || norm(p.mun).indexOf(q)>=0; }); }
  var ord=base.slice().sort(function(a,b){
    var va=a[col], vb=b[col];
    if(va==null&&vb==null) return 0; if(va==null) return 1; if(vb==null) return -1;
    if(typeof va==='number'||typeof vb==='number') return (va-vb)*dir;
    return (''+va).localeCompare(''+vb,'pt-BR')*dir;
  });
  var head=COLS.map(function(c){ var ar=col===c.k?(dir<0?' ▼':' ▲'):'';
    return '<th data-k="'+c.k+'" class="'+((c.t==='r'||c.t==='n')?'n':'')+(col===c.k?' ord':'')+'">'+c.l+ar+'</th>'; }).join('');
  var LIM=1000, cap = q? ord.length : Math.min(LIM, ord.length);   // busca mostra todos os achados
  var rows=ord.slice(0,cap).map(function(p){
    return '<tr>'+COLS.map(function(c){ return '<td class="'+((c.t==='r'||c.t==='n')?'n':'')+'">'+fmtCel(p,c)+'</td>'; }).join('')+'</tr>'; }).join('');
  document.getElementById('tabelaHead').innerHTML='<tr>'+head+'</tr>';
  document.getElementById('tabelaBody').innerHTML=rows || '<tr><td colspan="16" style="padding:12px;color:#8A9099">Nenhum processo encontrado.</td></tr>';
  var info;
  if(q){ info='<b>'+nfmt(ord.length)+'</b> processo(s) encontrado(s) para “'+S.tq+'” (dentro do recorte atual).'; }
  else if(ord.length>LIM){ info='Exibindo as <b>'+nfmt(LIM)+'</b> primeiras de <b>'+nfmt(ord.length)+'</b> linhas '+
      '<span class="alerta">(o total não cabe na tela)</span> — busque por protocolo/processo/município acima, '+
      'ou baixe o <b>CSV</b> (Exportar) para o conjunto completo.'; }
  else { info='<b>'+nfmt(ord.length)+'</b> processos no recorte — tabela completa.'; }
  document.getElementById('tabelaInfo').innerHTML=info;
  document.querySelectorAll('#tabelaHead th').forEach(function(th){
    th.onclick=function(){ var k=th.getAttribute('data-k');
      if(S.ordCol===k) S.ordDir=-S.ordDir; else { S.ordCol=k; S.ordDir=-1; }
      tabela(filtra()); }; });
}

/* ===================== modal ===================== */
function abreModal(tit,html){
  document.getElementById('modalTit').textContent=tit;
  document.getElementById('modalCorpo').innerHTML=html;
  document.getElementById('modalFundo').classList.add('on');
}
function fechaModal(){ document.getElementById('modalFundo').classList.remove('on'); }
function modalSobre(){
  var N=META.notas||{};
  var h='<h4>O que é este painel</h4>'+
    '<p>Painel público de transparência da <b>SEDEC/MIDR</b> sobre os recursos e processos '+
    'federais das <b>ações de resposta a desastres</b> (socorro, assistência e restabelecimento). '+
    'Reúne, num só lugar, quanto foi solicitado e liberado, para quais municípios, em que fase e '+
    'com que desfecho — permitindo o acompanhamento e o controle social de forma direta.</p>'+
    '<h4>O que você encontra aqui</h4>'+
    '<p>Filtros por região, UF, município (busca), fase da ação, finalidade e situação; um funil que '+
    'mostra o caminho do pleito (do rascunho ao recurso transferido); indicadores de recurso liberado, '+
    'acesso ao recurso, dificuldade do ente e prazos (do município e da SEDEC); evolução mensal; mapa '+
    'por UF e município; e um detalhamento completo, tudo <b>exportável</b> (CSV e relatório PDF) no '+
    'recorte selecionado.</p>'+
    '<h4>Como ler as situações</h4>'+
    '<p>Leitura <b>neutra e diagnóstica</b>. <b>Rascunho</b> (salvo, nunca enviado) e <b>excluído pelo '+
    'ente</b> sinalizam dificuldade do município em cadastrar/levar adiante o pedido — muitos sequer '+
    'geram número de processo. <b>Indeferido</b> é decisão da SEDEC; <b>devolvido ao ente</b> aguarda '+
    'ajustes que, se sanados, permitem prosseguir.</p>'+
    (N.ocp? '<h4>Operação Carro Pipa (OCP)</h4><div class="tcu-item">'+N.ocp+'</div>':'')+
    (N.finalidade? '<h4>Finalidade (custeio × investimento)</h4><p>'+N.finalidade+'</p>':'')+
    (N.dificuldade? '<h4>Dificuldade do ente</h4><p>'+N.dificuldade+'</p>':'')+
    (N.revisoes? '<p style="color:#8A9099;font-size:12px">'+N.revisoes+'</p>':'')+
    '<h4>Fonte e data</h4><p>'+META.fonte+'<br>Recorte: '+META.recorte+'<br>'+
    'Consolidação gerada em '+dbr(META.data_geracao)+'.</p>'+
    '<p style="margin-top:14px;color:#8A9099;font-size:12px">Elaboração: Lincoln Duques de Barros — '+
    'Analista de Infraestrutura — SEDEC/MIDR. Protótipo em avaliação. Dados públicos.</p>';
  abreModal('Sobre o Painel de Transparência da SEDEC', h);
}

/* ===================== exportação ===================== */
function exportaCSV(){
  var f=filtra();
  var cols=['uf','mun','cd','rg','des','fac','fin','sit','fase','proc','prot',
    'dcri','dsol','ddes','vsol','vlib','vcus','npes','gnd','fnt','tsol','tana','tlib','anl'];
  var head=cols.join(';');
  var linhas=f.map(function(p){ return cols.map(function(c){
    var v=p[c]==null?'':p[c]; if(typeof v==='string'&&/[;"\n]/.test(v)) v='"'+v.replace(/"/g,'""')+'"';
    return v; }).join(';'); });
  var csv='﻿'+head+'\n'+linhas.join('\n');
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='Transparencia_SEDEC_'+anoSlug()+'_'+slug(recorteTexto())+'.csv'; a.click();
}
/* mapa coroplético ESTÁTICO em SVG (p/ o relatório PDF) — sem Leaflet/tiles.
   Desenha a UF (Brasil) ou os municípios da UF selecionada, cor pela métrica ativa. */
function svgMapa(f){
  var porUF=!S.uf, feats, keyf;
  if(!porUF && munCacheGeo[S.uf]){ feats=munCacheGeo[S.uf].features; keyf='cd'; }
  else { feats=UFGEO.features; keyf='uf'; porUF=true; }   // fallback: Brasil (f já filtra a UF)
  var m=agrupa(f, keyf), met=S.metMapa;
  var max=Math.max.apply(null, Object.values(m).map(function(o){return valorMapa(o,met);}).concat([0]));
  var minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
  function each(g,cb){ var t=g.type,c=g.coordinates;
    if(t==='Polygon') c.forEach(function(r){r.forEach(cb);});
    else if(t==='MultiPolygon') c.forEach(function(p){p.forEach(function(r){r.forEach(cb);});}); }
  feats.forEach(function(ft){ each(ft.geometry,function(p){
    if(p[0]<minx)minx=p[0]; if(p[0]>maxx)maxx=p[0]; if(p[1]<miny)miny=p[1]; if(p[1]>maxy)maxy=p[1]; }); });
  var kx=Math.cos((miny+maxy)/2*Math.PI/180), W=620;
  var spanx=(maxx-minx)*kx||1, spany=(maxy-miny)||1, H=W*spany/spanx;
  function X(lon){ return ((lon-minx)*kx/spanx*W); }
  function Y(lat){ return ((maxy-lat)/spany*H); }
  function d(g){ var s='';
    function ring(r){ r.forEach(function(p,i){ s+=(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)+' '; }); s+='Z '; }
    if(g.type==='Polygon') g.coordinates.forEach(ring);
    else if(g.type==='MultiPolygon') g.coordinates.forEach(function(p){p.forEach(ring);});
    return s; }
  var paths=feats.map(function(ft){ var o=m[ft.properties[keyf]];
    var fill=o? corEscala(valorMapa(o,met),max,met):'#EEF1F6';
    return '<path d="'+d(ft.geometry)+'" fill="'+fill+'" stroke="#fff" stroke-width="0.5"/>'; }).join('');
  return '<svg viewBox="0 0 '+W.toFixed(0)+' '+H.toFixed(0)+'" xmlns="http://www.w3.org/2000/svg" '+
    'preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">'+paths+'</svg>';
}
var ROT_MET={vlib:'Recurso liberado por local',n:'Nº de processos por local',
  taxa:'Acesso ao recurso (%)',dific:'Dificuldade do ente (%)'};

/* texto legível do recorte ativo (para cabeçalho do PDF e nome dos arquivos) */
function recorteTexto(){
  var p=[];
  if(S.regiao) p.push('Região '+S.regiao);
  if(S.uf) p.push('UF '+S.uf);
  if(S.mun) p.push('Município '+(NOME_MUN[S.mun]||S.mun));
  if(S.fase===FASE_NAO) p.push('Fase não informada');
  else if(S.fase) p.push('Fase '+S.fase);
  if(S.fin) p.push('Finalidade '+S.fin);
  if(S.des) p.push('Desastre '+S.des);
  if(S.grupo) p.push('Situação '+GLBL[S.grupo]);
  return p.length? p.join(' · ') : 'Brasil — todos os processos';
}
function slug(s){ return (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,90) || 'recorte'; }
/* relatório PDF sintético (via impressão): esconde o tabelão, mantém indicadores */
/* ---- exportação da CAMADA GEOGRÁFICA do recorte (GeoJSON / KMZ) ---- */
function baixa(nome, conteudo, tipo){
  var blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo],{type:tipo||'text/plain;charset=utf-8'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=nome; a.click();
}
function propsGeo(o, nome){
  return { local:nome, uf:o.uf_||undefined, regiao:o.rg||undefined, processos:o.n,
    financeiros:o.fin, recurso_liberado:Math.round((o.vlib||0)*100)/100,
    valor_solicitado:Math.round((o.vsol||0)*100)/100,
    acesso_pct:pct(o.suc,o.efetiva), dificuldade_pct:pct(o.dific,o.fin),
    acessaram_recurso:o.suc }; }
function fcRecorte(){
  var f=filtra(), porUF=!S.uf;
  var m=agrupa(f, porUF?'uf':'cd');
  var feats, keyf;
  if(porUF){ feats=UFGEO.features; keyf='uf'; }
  else if(munCacheGeo[S.uf]){ feats=munCacheGeo[S.uf].features; keyf='cd'; }
  else { feats=UFGEO.features; keyf='uf'; }
  var out=[];
  feats.forEach(function(ft){ var o=m[ft.properties[keyf]]; if(!o) return;
    var nome = ft.properties.nm || ft.properties.uf || o.k;
    o.uf_ = ft.properties.uf;
    out.push({type:'Feature', properties:propsGeo(o,nome), geometry:ft.geometry}); });
  return {type:'FeatureCollection', name:'transparencia_'+anoSlug(),
    crs:{type:'name',properties:{name:'urn:ogc:def:crs:OGC:1.3:CRS84'}}, features:out};
}
function geomKML(g){
  function ring(c){ return '<coordinates>'+c.map(function(p){return p[0]+','+p[1];}).join(' ')+'</coordinates>'; }
  function poly(cs){ var h='<Polygon><outerBoundaryIs><LinearRing>'+ring(cs[0])+'</LinearRing></outerBoundaryIs>';
    for(var i=1;i<cs.length;i++) h+='<innerBoundaryIs><LinearRing>'+ring(cs[i])+'</LinearRing></innerBoundaryIs>';
    return h+'</Polygon>'; }
  if(g.type==='Polygon') return poly(g.coordinates);
  if(g.type==='MultiPolygon') return '<MultiGeometry>'+g.coordinates.map(poly).join('')+'</MultiGeometry>';
  return '';
}
function escX(s){ return String(s==null?'':s).replace(/[<&>]/g,function(c){return {'<':'&lt;','&':'&amp;','>':'&gt;'}[c];}); }
function exportaGeo(fmt){
  var fc=fcRecorte(), base='Transparencia_SEDEC_'+anoSlug()+'_'+slug(recorteTexto());
  if(!fc.features.length){ alert('Sem feições com dados no recorte atual.'); return; }
  if(fmt==='geojson'){ baixa(base+'.geojson', JSON.stringify(fc), 'application/geo+json'); return; }
  // KMZ
  var kml='<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+
    '<name>Transparência SEDEC — '+escX(anoTxt())+'</name>'+
    '<Style id="e"><LineStyle><color>ff682f27</color><width>1.2</width></LineStyle>'+
    '<PolyStyle><color>4c4b7f27</color></PolyStyle><BalloonStyle><text>$[description]</text></BalloonStyle></Style>';
  fc.features.forEach(function(f){ var p=f.properties;
    var desc='<table style="font-family:Arial;font-size:12px">'+
      '<tr><td><b>'+escX(p.local)+(p.uf?(' — '+p.uf):'')+'</b></td></tr>'+
      '<tr><td>Processos: '+nfmt(p.processos)+'</td></tr>'+
      '<tr><td>Recurso liberado: '+reais(p.recurso_liberado)+'</td></tr>'+
      '<tr><td>Acesso ao recurso: '+p.acesso_pct+'%</td></tr>'+
      '<tr><td>Dificuldade do ente: '+p.dificuldade_pct+'%</td></tr></table>';
    kml+='<Placemark><name>'+escX(p.local)+'</name><styleUrl>#e</styleUrl>'+
      '<description><![CDATA['+desc+']]></description>'+geomKML(f.geometry)+'</Placemark>';
  });
  kml+='</Document></kml>';
  var zipped=fflate.zipSync({'doc.kml':fflate.strToU8(kml)},{level:9});
  baixa(base+'.kmz', new Blob([zipped],{type:'application/vnd.google-earth.kmz'}));
}

function exportaPDF(){
  var rec=recorteTexto();
  var f=filtra();
  document.getElementById('printHead').innerHTML=
    '<div class="ph-sub"><b>Recorte:</b> '+rec+' · '+anoTxt()+' · Ações de resposta</div>'+
    '<div class="ph-sub">Fonte: '+META.fonte+' · Gerado em '+dbr(META.data_geracao)+'. '+
    'Detalhamento processo a processo disponível na exportação CSV.</div>';
  var terr = S.mun? (NOME_MUN[S.mun]||S.mun)+'/'+S.uf : S.uf? 'UF '+S.uf : S.regiao? 'Região '+S.regiao : 'Brasil';
  var mapaSVG=''; try{ mapaSVG=svgMapa(f); }catch(e){}
  document.getElementById('printDestaque').innerHTML=
    '<div class="pd-mapwrap">'+
      '<div class="pd-maptit">'+terr+' · '+anoTxt()+' · ações de resposta</div>'+
      (mapaSVG||'<div style="color:#8A9099;font-size:11px">mapa indisponível</div>')+
      '<div class="pd-mapcap">'+(ROT_MET[S.metMapa]||'')+'</div>'+
    '</div>'+
    '<div class="pd-sintese"><h4>Síntese do recorte</h4><div class="narr">'+
      document.getElementById('narr').innerHTML+'</div>'+
      '<div class="pd-dest"><h4>Destaques do recorte</h4>'+
      document.getElementById('destaques').innerHTML+'</div></div>';
  var t0=document.title;
  document.title='Transparencia_SEDEC_'+anoSlug()+'_'+slug(rec);
  var restore=function(){ document.title=t0; window.removeEventListener('afterprint',restore); };
  window.addEventListener('afterprint',restore);
  setTimeout(function(){ [chUF,chPz,chSit,chDes,chTempo,chDevol].forEach(function(c){if(c)try{c.resize();}catch(e){}});
    window.print(); }, 60);
}

/* ===================== eventos / filtros ===================== */
function setFiltro(campo,val){
  // remoção de chips especiais (ano/período)
  if(campo==='anos'){ S.anos=[]; aplicaAnosUI(); render(); return; }
  if(campo==='periodo'){ S.dini=''; S.dfim='';
    document.getElementById('fDini').value=''; document.getElementById('fDfim').value=''; render(); return; }
  S[campo]=val;
  // coerência entre recortes territoriais
  if(campo==='regiao'){ segOn('fRegiao',val); S.uf=''; S.mun='';
    document.getElementById('fUF').value=''; limpaBusca(); }
  if(campo==='uf'){ document.getElementById('fUF').value=val; S.mun=''; limpaBusca(); }
  if(campo==='fase') segOn('fFase',val);
  if(campo==='fin') document.getElementById('fFin').value=val;
  if(campo==='des') document.getElementById('fDes').value=val;
  render();
}
function selecionaMun(cd){
  var m=BUSCA.filter(function(x){return x.cd===cd;})[0]; if(!m) return;
  S.uf=m.uf; S.mun=cd; document.getElementById('fUF').value=m.uf;
  document.getElementById('fBuscaMun').value=m.nome; fechaBusca();
  render();
}
function segOn(id,val){ document.querySelectorAll('#'+id+' button').forEach(function(b){
  b.classList.toggle('on', b.getAttribute('data-v')===val); }); }
function ligaSeg(id,campo){ document.querySelectorAll('#'+id+' button').forEach(function(b){
  b.onclick=function(){ setFiltro(campo,b.getAttribute('data-v')); }; }); }

function aplicaAnosUI(){
  document.querySelectorAll('#fAno button').forEach(function(b){
    var a=b.getAttribute('data-a');
    b.classList.toggle('on', a===''? S.anos.length===0 : S.anos.indexOf(parseInt(a,10))>=0);
  });
}
function ligaEventos(){
  ligaSeg('fRegiao','regiao'); ligaSeg('fFase','fase');
  // anos (multisseleção) + período por data
  document.querySelectorAll('#fAno button').forEach(function(b){ b.onclick=function(){
    var a=b.getAttribute('data-a');
    if(a===''){ S.anos=[]; }
    else { var y=parseInt(a,10), i=S.anos.indexOf(y); if(i>=0) S.anos.splice(i,1); else S.anos.push(y); }
    aplicaAnosUI(); render(); }; });
  var di=document.getElementById('fDini'), df=document.getElementById('fDfim');
  di.onchange=function(){ S.dini=this.value; render(); };
  df.onchange=function(){ S.dfim=this.value; render(); };
  document.getElementById('btnPeriodoX').onclick=function(){ S.dini=''; S.dfim=''; di.value=''; df.value=''; render(); };
  document.getElementById('fUF').onchange=function(){ setFiltro('uf',this.value); };
  document.getElementById('fFin').onchange=function(){ setFiltro('fin',this.value); };
  document.getElementById('fDes').onchange=function(){ setFiltro('des',this.value); };
  document.getElementById('fBuscaTab').oninput=function(){ S.tq=this.value; tabela(filtra()); };
  bindBusca();
  document.querySelectorAll('#metUF button').forEach(function(b){ b.onclick=function(){
    document.querySelectorAll('#metUF button').forEach(function(x){x.classList.remove('on');}); b.classList.add('on');
    S.metUF=b.getAttribute('data-v'); graficoUF(filtra()); }; });
  document.querySelectorAll('#metMapa button').forEach(function(b){ b.onclick=function(){
    document.querySelectorAll('#metMapa button').forEach(function(x){x.classList.remove('on');}); b.classList.add('on');
    S.metMapa=b.getAttribute('data-v'); pintaMapa(filtra()); }; });
  document.getElementById('btnLimpar').onclick=function(){
    S={anos:[],dini:'',dfim:'',regiao:'',uf:'',mun:'',fase:'',fin:'',des:'',grupo:'',tq:'',
       metUF:S.metUF,metMapa:S.metMapa,sel:null,_scope:S._scope,ordCol:S.ordCol,ordDir:S.ordDir};
    ['fRegiao','fFase'].forEach(function(id){segOn(id,'');});
    aplicaAnosUI();
    document.getElementById('fDini').value=''; document.getElementById('fDfim').value='';
    document.getElementById('fUF').value=''; document.getElementById('fFin').value='';
    document.getElementById('fDes').value=''; document.getElementById('fBuscaTab').value='';
    limpaBusca(); render(); };
  var expB=document.getElementById('btnExp'), expM=document.getElementById('expMenu');
  expB.onclick=function(e){ e.stopPropagation(); expM.classList.toggle('on'); };
  document.addEventListener('click',function(){ expM.classList.remove('on'); });
  expM.querySelectorAll('button').forEach(function(b){ b.onclick=function(){
    expM.classList.remove('on'); if(b.getAttribute('data-t')==='csv')exportaCSV(); else exportaPDF(); }; });
  document.getElementById('navSobre').onclick=function(e){e.preventDefault();modalSobre();};
  document.getElementById('navRecon').onclick=function(e){e.preventDefault();};
  document.getElementById('modalFechar').onclick=fechaModal;
  document.getElementById('modalFundo').onclick=function(e){ if(e.target===this) fechaModal(); };
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') fechaModal(); });
  window.addEventListener('resize',function(){ resizeTudo(); medeTopo(); });
  // ResizeObserver: corrige o dimensionamento dos gráficos/mapa quando o
  // container muda (ex.: painel exibido depois da carga, coluna redimensionada).
  if(window.ResizeObserver){
    new ResizeObserver(function(){ resizeTudo(); }).observe(document.querySelector('.corpo'));
    // altura do topo congelado → offset do sticky da coluna direita
    new ResizeObserver(medeTopo).observe(document.querySelector('.topo'));
  }
  medeTopo();
}
function medeTopo(){ var t=document.querySelector('.topo');
  if(t) document.documentElement.style.setProperty('--topo-h', t.offsetHeight+'px'); }
function resizeTudo(){
  [chUF,chPz,chSit,chDes,chTempo,chDevol].forEach(function(c){ if(c) try{c.resize();}catch(e){} });
  if(mapa) try{ mapa.invalidateSize(); }catch(e){}
}

/* ===================== busca de município ===================== */
function fechaBusca(){ document.getElementById('buscaRes').classList.remove('on'); }
function limpaBusca(){ var i=document.getElementById('fBuscaMun'); if(i) i.value=''; fechaBusca(); }
function bindBusca(){
  var inp=document.getElementById('fBuscaMun'), box=document.getElementById('buscaRes');
  inp.oninput=function(){
    var q=norm(inp.value); if(q.length<2){ fechaBusca(); return; }
    var res=BUSCA.filter(function(m){ return norm(m.nome).indexOf(q)>=0; }).slice(0,40);
    if(!res.length){ box.innerHTML='<div class="vazio">Nenhum município com processo</div>'; box.classList.add('on'); return; }
    box.innerHTML=res.map(function(m){
      return '<div data-cd="'+m.cd+'"><span>'+m.nome+'</span><span class="uf-tag">'+m.uf+' · '+m.n+'</span></div>'; }).join('');
    box.classList.add('on');
    box.querySelectorAll('div[data-cd]').forEach(function(d){ d.onclick=function(){ selecionaMun(d.getAttribute('data-cd')); }; });
  };
  inp.onkeydown=function(e){ if(e.key==='Enter'){ var f=document.querySelector('#buscaRes div[data-cd]'); if(f) f.click(); }
    if(e.key==='Escape') fechaBusca(); };
  document.addEventListener('click',function(e){ if(!inp.parentElement.contains(e.target)) fechaBusca(); });
}

function rodape(){
  document.getElementById('rodape').innerHTML=
    '<b>Fonte:</b> '+META.fonte+' · Consolidação gerada em '+dbr(META.data_geracao)+'. '+
    '<b>Recorte:</b> '+META.recorte+' '+
    '<br>Painel de transparência da SEDEC/MIDR — protótipo em avaliação. '+
    'Elaboração: Lincoln Duques de Barros — Analista de Infraestrutura — SEDEC/MIDR. '+
    'Dados públicos; malha territorial IBGE 2025.';
}

carrega();
