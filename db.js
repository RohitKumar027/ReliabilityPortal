// db.js — simple localStorage-based data layer
// Provides a tiny persistence API for labData so data survives page reloads.
(function(){
  const KEY = 'labData';
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('DB.load error', e);
      return null;
    }
  }
  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('DB.save error', e);
    }
  }
  function clear() {
    localStorage.removeItem(KEY);
  }
  // Expose
  window.DB = { load, save, clear };
})();
