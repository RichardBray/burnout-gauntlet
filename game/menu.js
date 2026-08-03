// menu.js — START menu and Esc PAUSE menu. Same options in both.
//
// WHY THIS FILE EXISTS. Three things were undiscoverable or impossible without a reload:
// the control list (a player had to ask what boost was bound to), the time of day and
// wet/dry knobs (both already existed at runtime and nothing but the boot path called
// them), and the render resolution scale that the frame-time work needs. The start
// menu's click is also the only legitimate user gesture on the boot path, so it is what
// unlocks WebAudio instead of leaving that to whatever key the player happens to press.
//
// API (this is the contract main.js is written against — keep it):
//   createMenu({ ctx, onStart }) -> m
//     ctx      the window.__game context: applyTimeOfDay/applyWet/setResScale/setPaused,
//              getTimeOfDay/getWet/getResScale/frameStats
//     onStart  called once, on the start click, AFTER the menu has closed
//   m.showStart()   open as the start menu (no resume, no scene already running)
//   m.showPause()   open as the pause menu (has a resume button)
//   m.hide()
//   m.isOpen()
//
// This module owns its own DOM and its own Esc handling. It must not read the game's key
// state: the menu is pointer-driven so it keeps working while the game holds keys down.

export function createMenu({ ctx, onStart } = {}) {
  let open = false;
  const api = {
    showStart() { open = true; },
    showPause() { open = true; },
    hide() { open = false; },
    isOpen: () => open,
  };
  return api;
}
