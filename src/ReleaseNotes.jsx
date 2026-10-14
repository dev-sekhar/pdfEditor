import React, { useEffect, useRef, useState } from 'react';
import { APP_VERSION, RELEASES, markReleaseSeen, shouldShowRelease } from './releases';

export default function ReleaseNotes() {
  const dialog = useRef(null);
  const [open, setOpen] = useState(() => shouldShowRelease(window.localStorage));
  useEffect(() => {
    if (open && !dialog.current.open) dialog.current.showModal();
  }, [open]);
  function close() {
    markReleaseSeen(window.localStorage);
    dialog.current.close();
    setOpen(false);
  }
  return <>
    <button className="whats-new" onClick={() => setOpen(true)}>What’s new</button>
    <dialog ref={dialog} className="release-dialog" aria-labelledby="release-title"
      onCancel={event => { event.preventDefault(); close(); }}>
      <h2 id="release-title">What’s new in PDF Studio {APP_VERSION}</h2>
      <ul>{(RELEASES[APP_VERSION] || []).map(feature => <li key={feature}>{feature}</li>)}</ul>
      <button className="primary" autoFocus onClick={close}>Got it</button>
    </dialog>
  </>;
}
