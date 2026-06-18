// use_figma — fileKey: 18LO5MRi3siNwhUaf4ARV2
// Builds: Google SSO sign-in, Mode selection, Worker wizard (page "01 · Screens", placed at x=0/1600/3200, y=-1400)
for (const s of ['Regular','Medium','Bold']) await figma.loadFontAsync({family:'Tajawal',style:s});
const C={primary:{r:0.424,g:0.439,b:0.863},primaryDark:{r:0.318,g:0.333,b:0.745},tint:{r:0.914,g:0.925,b:0.980},bg:{r:0.965,g:0.969,b:0.992},ink:{r:0.137,g:0.149,b:0.247},sub:{r:0.42,g:0.44,b:0.53},line:{r:0.855,g:0.867,b:0.925},white:{r:1,g:1,b:1},googleBlue:{r:0.26,g:0.52,b:0.96}};
const F=c=>[{type:'SOLID',color:c}];
const T=(t,s,st,c,a)=>{const n=figma.createText();n.fontName={family:'Tajawal',style:st};n.characters=t;n.fontSize=s;n.fills=F(c);if(a)n.textAlignHorizontal=a;return n;};
function V(name,gap,pv,ph,fill,w){const f=figma.createFrame();f.name=name;f.layoutMode='VERTICAL';f.itemSpacing=gap;f.paddingTop=f.paddingBottom=pv;f.paddingLeft=f.paddingRight=ph;f.fills=fill?F(fill):[];f.primaryAxisSizingMode='AUTO';if(w){f.counterAxisSizingMode='FIXED';f.resize(w,10);}else f.counterAxisSizingMode='AUTO';return f;}
function H(name,gap,pv,ph,fill,w){const f=figma.createFrame();f.name=name;f.layoutMode='HORIZONTAL';f.itemSpacing=gap;f.paddingTop=f.paddingBottom=pv;f.paddingLeft=f.paddingRight=ph;f.fills=fill?F(fill):[];f.counterAxisSizingMode='AUTO';if(w){f.primaryAxisSizingMode='FIXED';f.resize(w,10);}else f.primaryAxisSizingMode='AUTO';f.counterAxisAlignItems='CENTER';return f;}
const page=figma.root.children.find(p=>p.name==='01 · Screens');
await figma.setCurrentPageAsync(page);
const Y=-1400;

// Screen 1: Sign in — Google SSO only
const s1=V('Auth / تسجيل الدخول — Google SSO فقط',0,90,0,C.bg,1440); s1.x=0; s1.y=Y; s1.counterAxisAlignItems='CENTER';
const card=V('card',22,40,44,C.white,520); card.cornerRadius=18; card.counterAxisAlignItems='CENTER'; card.strokes=F(C.line); card.strokeWeight=1;
card.appendChild(T('شغل أونلاين',34,'Bold',C.primary,'CENTER'));
card.appendChild(T('مرحبًا بك! سجّل الدخول أو أنشئ حسابًا',22,'Bold',C.ink,'CENTER'));
const sub1=T('باستخدام حساب جوجل فقط — لا حاجة لكلمة مرور أو رمز تحقق',15,'Regular',C.sub,'CENTER'); sub1.resize(420,20); sub1.textAutoResize='HEIGHT'; card.appendChild(sub1);
const gbtn=H('google-btn',12,14,28,C.white,420); gbtn.cornerRadius=12; gbtn.strokes=F(C.line); gbtn.strokeWeight=1.4; gbtn.primaryAxisAlignItems='CENTER';
gbtn.appendChild(T('المتابعة باستخدام جوجل',17,'Medium',C.ink,'CENTER'));
gbtn.appendChild(T('G',22,'Bold',C.googleBlue,'CENTER'));
card.appendChild(gbtn);
const legal=T('بالمتابعة فإنك توافق على الشروط والأحكام وسياسة الخصوصية',13,'Regular',C.sub,'CENTER'); legal.resize(420,18); legal.textAutoResize='HEIGHT'; card.appendChild(legal);
const sec=H('secnote',8,10,16,C.tint,420); sec.cornerRadius=10;
const secT=T('🔒 يتحقق الخادم من هوية جوجل ويصدر جلسة آمنة — لا تُخزَّن أي كلمات مرور',13,'Regular',C.primaryDark,'RIGHT'); secT.layoutGrow=1; secT.textAutoResize='HEIGHT'; sec.appendChild(secT);
card.appendChild(sec);
const closed=H('reg-closed',8,10,16,{r:0.99,g:0.95,b:0.86},420); closed.cornerRadius=10;
const clT=T('حالة خاصة: عند إيقاف التسجيل من الإدارة تظهر رسالة «التسجيل مغلق حاليًا» للمستخدمين الجدد فقط',12,'Regular',{r:0.62,g:0.42,b:0.05},'RIGHT'); clT.layoutGrow=1; clT.textAutoResize='HEIGHT'; closed.appendChild(clT);
card.appendChild(closed);
s1.appendChild(card); page.appendChild(s1);

// Screen 2: Mode selection
const s2=V('Auth / اختيار الوضع — أول تسجيل دخول',0,80,0,C.bg,1440); s2.x=1600; s2.y=Y; s2.counterAxisAlignItems='CENTER';
const wrap=V('wrap',26,0,0,null,980); wrap.counterAxisAlignItems='CENTER';
wrap.appendChild(T('أهلًا أحمد 👋 ماذا تريد أن تفعل اليوم؟',30,'Bold',C.ink,'CENTER'));
const subt=T('اختيارك يحدّد شكل الواجهة فقط — حسابك واحد ويمكنك التبديل بين الوضعين في أي وقت من الترويسة',16,'Regular',C.sub,'CENTER'); subt.resize(760,22); subt.textAutoResize='HEIGHT'; wrap.appendChild(subt);
const cards=H('cards',28,0,0,null);
function modeCard(emoji,title,desc,active){const c=V('mode',14,34,30,C.white,440);c.cornerRadius=18;c.counterAxisAlignItems='CENTER';c.strokes=F(active?C.primary:C.line);c.strokeWeight=active?2.5:1.2;
 c.appendChild(T(emoji,46,'Regular',C.ink,'CENTER'));
 c.appendChild(T(title,24,'Bold',active?C.primaryDark:C.ink,'CENTER'));
 const d=T(desc,15,'Regular',C.sub,'CENTER'); d.resize(360,40); d.textAutoResize='HEIGHT'; c.appendChild(d);
 const b=H('cta',8,12,30,active?C.primary:C.tint); b.cornerRadius=10; b.appendChild(T(active?'متابعة كباحث عن عمل':'اختيار هذا الوضع',15,'Medium',active?C.white:C.primaryDark,'CENTER')); c.appendChild(b);
 return c;}
cards.appendChild(modeCard('🧑‍💼','أوظِّف الآن','انشر وظائف، استقبل العروض، اشترِ خدمات مميزة، وأدر عقودك ومدفوعاتك',false));
cards.appendChild(modeCard('💼','أبحث عن عمل','تصفّح الوظائف، قدّم العروض، أنشئ خدماتك المميزة، واستلم أرباحك بأمان',true));
wrap.appendChild(cards);
wrap.appendChild(T('💡 كل شيء محفوظ: عقودك ومحفظتك ومحادثاتك تبقى كما هي عند التبديل بين الوضعين',14,'Regular',C.sub,'CENTER'));
s2.appendChild(wrap); page.appendChild(s2);

// Screen 3: Worker wizard
const s3=V('Auth / إكمال ملف الباحث عن عمل — خطوة ٢ من ٥',0,70,0,C.bg,1440); s3.x=3200; s3.y=Y; s3.counterAxisAlignItems='CENTER';
const w3=V('card',24,36,40,C.white,860); w3.cornerRadius=18; w3.strokes=F(C.line); w3.strokeWeight=1; w3.counterAxisAlignItems='MAX';
const prog=H('progress',8,0,0,null,780);
for(let i=0;i<5;i++){const seg=figma.createRectangle();seg.resize(148,8);seg.cornerRadius=99;seg.fills=F(i<2?C.primary:C.tint);prog.appendChild(seg);}
w3.appendChild(prog);
w3.appendChild(T('ما مجال خبرتك؟',26,'Bold',C.ink,'RIGHT'));
w3.appendChild(T('الخطوة ٢ من ٥ — اختر الخدمة الرئيسية والتخصصات الفرعية ومهاراتك',15,'Regular',C.sub,'RIGHT'));
function field(label,value){const f=V('field',6,0,0,null,780);f.counterAxisAlignItems='MAX';f.appendChild(T(label,14,'Medium',C.ink,'RIGHT'));const b=H('box',8,12,14,C.bg,780);b.cornerRadius=10;b.strokes=F(C.line);b.strokeWeight=1.2;b.primaryAxisAlignItems='SPACE_BETWEEN';b.appendChild(T('▾',14,'Regular',C.sub,'LEFT'));b.appendChild(T(value,15,'Regular',C.ink,'RIGHT'));f.appendChild(b);return f;}
w3.appendChild(field('الخدمة الرئيسية','التصميم والإبداع'));
w3.appendChild(field('التخصص الفرعي','تصميم واجهات وتجربة المستخدم UI/UX'));
const sk=V('skills',8,0,0,null,780); sk.counterAxisAlignItems='MAX';
sk.appendChild(T('المهارات (مع مستوى الإتقان)',14,'Medium',C.ink,'RIGHT'));
const chips=H('chips',10,0,0,null);
for(const [t,lv] of [['Figma · متقدم',1],['تصميم تفاعلي · متوسط',0],['+ أضف مهارة',2]]){const ch=H('chip',6,8,16,lv===1?C.primary:(lv===2?null:C.tint));ch.cornerRadius=99;if(lv===2){ch.strokes=F(C.primary);ch.strokeWeight=1.2;}ch.appendChild(T(t,13,'Medium',lv===1?C.white:C.primaryDark,'CENTER'));chips.appendChild(ch);}
sk.appendChild(chips); w3.appendChild(sk);
const nav3=H('nav',12,0,0,null,780); nav3.primaryAxisAlignItems='SPACE_BETWEEN';
const back=H('b',8,12,28,null); back.cornerRadius=10; back.strokes=F(C.line); back.strokeWeight=1.2; back.appendChild(T('رجوع',15,'Medium',C.sub,'CENTER'));
const grp=H('g',10,0,0,null);
const skip=H('s',8,12,24,null); skip.appendChild(T('تخطّي',15,'Medium',C.sub,'CENTER'));
const next=H('n',8,12,34,C.primary); next.cornerRadius=10; next.appendChild(T('التالي',15,'Medium',C.white,'CENTER'));
grp.appendChild(skip); grp.appendChild(next);
nav3.appendChild(back); nav3.appendChild(grp);
w3.appendChild(nav3);
s3.appendChild(w3); page.appendChild(s3);
return 'auth screens rebuilt';
