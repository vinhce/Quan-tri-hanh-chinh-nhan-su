(function () {
  try {
    var theme = localStorage.getItem('hrm_theme');
    if (theme !== 'light') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
