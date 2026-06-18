/* Injects shared header/footer. Usage: <body data-shell="worker|employer|visitor" data-active="jobs">
   Renders RTL Arabic header with mode toggle (per SRS FR-MODE-2: toggle in every header). */
(function () {
  const body = document.body;
  const mode = body.dataset.shell || 'visitor';
  const active = body.dataset.active || '';

  const NAV = [
    ['home', 'الرئيسية', '#'],
    ['jobs', 'الوظائف', '#'],
    ['services', 'الخدمات المميزة', '#'],
    ['contracts', 'عقودي', '#'],
    ['wallet', 'المحفظة', '#'],
  ];

  const navHtml = NAV.map(([k, t]) =>
    `<a href="#" class="${k === active ? 'active' : ''}">${t}</a>`).join('');

  const toggleHtml = mode === 'visitor' ? '' : `
    <div class="mode-toggle" title="حساب واحد — التبديل لا يفقد أي بيانات (SRS §3.1)">
      <button class="${mode === 'employer' ? 'active' : ''}">أوظِّف الآن</button>
      <button class="${mode === 'worker' ? 'active' : ''}">أبحث عن عمل</button>
    </div>`;

  const actionsHtml = mode === 'visitor'
    ? `<button class="btn btn-primary btn-sm">تسجيل الدخول بجوجل</button>`
    : `${toggleHtml}
       <button class="icon-btn" title="المحادثات">💬<span class="badge">2</span></button>
       <button class="icon-btn" title="الإشعارات">🔔<span class="badge">4</span></button>
       <div class="avatar">م‌أ</div>`;

  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="inner">
      <span class="logo">شغل أونلاين</span>
      <nav class="main-nav">${navHtml}</nav>
      <div class="header-actions">${actionsHtml}</div>
    </div>`;
  body.prepend(header);

  if (mode !== 'visitor') {
    const tabs = document.createElement('nav');
    tabs.className = 'mobile-tabs';
    tabs.innerHTML = `
      <a href="#" class="${active === 'home' ? 'active' : ''}"><span class="tab-icon">🏠</span>الرئيسية</a>
      <a href="#" class="${active === 'jobs' ? 'active' : ''}"><span class="tab-icon">💼</span>الوظائف</a>
      <a href="#" class="${active === 'chat' ? 'active' : ''}"><span class="tab-icon">💬</span>المحادثات</a>
      <a href="#" class="${active === 'wallet' ? 'active' : ''}"><span class="tab-icon">👛</span>المحفظة</a>
      <a href="#"><span class="tab-icon">☰</span>المزيد</a>`;
    body.appendChild(tabs);
  }

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="inner">
      <div>
        <h4 class="logo" style="color:#fff">شغل أونلاين</h4>
        <p>منصة عربية تربط أصحاب الأعمال بالمستقلين — وظائف، خدمات مميزة، ومدفوعات آمنة بنظام الضمان.</p>
      </div>
      <div><h4>المنصة</h4>
        <p><a href="#">الوظائف</a><br><a href="#">الخدمات المميزة</a><br><a href="#">نظام الإحالة</a></p></div>
      <div><h4>روابط</h4>
        <p><a href="#">الأسئلة الشائعة</a><br><a href="#">الشروط والأحكام</a><br><a href="#">سياسة الخصوصية</a></p></div>
      <div><h4>تواصل معنا</h4>
        <p>support@shoghlonline.com<br>+965 0000 0000<br><a href="#">مركز الدعم</a></p></div>
    </div>
    <div class="legal">© ٢٠٢٦ شغل أونلاين — جميع الحقوق محفوظة</div>`;
  body.appendChild(footer);
})();
