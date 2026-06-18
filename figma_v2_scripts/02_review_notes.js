// use_figma — fileKey: 18LO5MRi3siNwhUaf4ARV2
// Builds the "02 · Review Notes" page: SRS traceability board
for (const s of ['Regular','Medium','Bold']) await figma.loadFontAsync({family:'Tajawal',style:s});
const C={primary:{r:0.424,g:0.439,b:0.863},primaryDark:{r:0.318,g:0.333,b:0.745},tint:{r:0.914,g:0.925,b:0.980},bg:{r:0.965,g:0.969,b:0.992},ink:{r:0.137,g:0.149,b:0.247},sub:{r:0.42,g:0.44,b:0.53},line:{r:0.855,g:0.867,b:0.925},white:{r:1,g:1,b:1},green:{r:0.13,g:0.63,b:0.42},greenT:{r:0.88,g:0.96,b:0.92}};
const F=c=>[{type:'SOLID',color:c}];
const T=(t,s,st,c,a)=>{const n=figma.createText();n.fontName={family:'Tajawal',style:st};n.characters=t;n.fontSize=s;n.fills=F(c);if(a)n.textAlignHorizontal=a;return n;};
function V(name,gap,pv,ph,fill,w){const f=figma.createFrame();f.name=name;f.layoutMode='VERTICAL';f.itemSpacing=gap;f.paddingTop=f.paddingBottom=pv;f.paddingLeft=f.paddingRight=ph;f.fills=fill?F(fill):[];f.primaryAxisSizingMode='AUTO';if(w){f.counterAxisSizingMode='FIXED';f.resize(w,10);}else f.counterAxisSizingMode='AUTO';return f;}
const page=figma.root.children.find(p=>p.name==='02 · Review Notes');
await figma.setCurrentPageAsync(page);
const board=V('SRS Traceability',14,36,40,C.white,1200); board.x=0; board.y=0; board.counterAxisAlignItems='MAX';
board.appendChild(T('مراجعة المطابقة مع SRS v1.1',30,'Bold',C.ink,'RIGHT'));
const rows=[
 ['تسجيل الدخول','FR-AUTH-1..6 — جوجل فقط، موافقة الشروط، حالة إيقاف التسجيل'],
 ['اختيار الوضع','FR-MODE-1..6 §3.1 — الوضع مجرد عرض، التبديل من الترويسة، لا فقدان بيانات'],
 ['معالج الملف','FR-PROF-2,3 — خطوات قابلة للتخطي، خدمة رئيسية/فرعية، مهارات بمستوى إتقان'],
 ['قائمة الوظائف','FR-JOB-3,4 + FR-SUB-1 — فلاتر (فئة/ميزانية/موقع/عدد عروض)، مفضلة، اشتراك بالفئة'],
 ['تفاصيل الوظيفة','FR-JOB-5,6 + FR-BID-1 — أسئلة الفرز إلزامية، عداد الرصيد، منع التقديم على وظيفتك (BR-21)'],
 ['نشر وظيفة','FR-JOB-1,2 — حقول كاملة + موقع، تنبيه المراجعة الإدارية، إشعار المشتركين'],
 ['إدارة العروض','FR-JOB-8,9 — ترتيب، تقييم خاص بالنجوم، قبول/رفض بسبب، ملاحظة الحجز والعقد الواحد (BR-6)'],
 ['العقد','FR-TASK-1..9 — مراحل الحالة، تمويل/ضمان/عمولة، تسليمات، طلب تعديل، إلغاء/نزاع'],
 ['المحادثات','FR-CHAT-1..9 — Firebase، إيصالات قراءة، صوت/ملفات، بريد ١٠ دقائق، قفل نهاية الضمان، إبلاغ'],
 ['المحفظة','FR-PAY-1,3,9 — ثلاثة أرصدة (متاح/ضمان/معلّق)، دفتر قيود، خصم السحب الفوري'],
 ['رصيد العروض','FR-BID-2..6 — استخدام بالفترات، باقات، استرداد تلقائي'],
 ['الإشعارات','FR-NOT-1 + FR-SUB-1..3 — مركز إشعارات، اشتراكات على مستوى الحساب، فوري/ملخص'],
 ['تذاكر الدعم','FR-TKT-1..5 — الحالات الخمس، الحل التلقائي، الربط بالعقد'],
 ['الإعدادات','FR-PROF-1,9 + BR-2 — تفضيل العرض، تفضيلات الإشعارات، شروط حذف الحساب'],
 ['الخدمات المميزة','FR-SVC-1..7 — كتالوج بفلاتر وتقييم، إضافات، إجمالي محسوب، حجز عند القبول'],
];
for(const [t,d] of rows){const r=V('r',4,12,16,C.bg,1120);r.cornerRadius=10;r.counterAxisAlignItems='MAX';
 r.appendChild(T('✅ '+t,16,'Bold',C.green,'RIGHT'));
 const dd=T(d,13,'Regular',C.sub,'RIGHT'); dd.resize(1088,17); dd.textAutoResize='HEIGHT'; r.appendChild(dd);
 board.appendChild(r);}
page.appendChild(board);
return 'review notes built';
