const paths:Record<string,string> = {
 settings:'<path d="M3 7h7m4 0h7M3 17h12m4 0h2"/><path d="M10 4v6m6 4v6"/>',
 close:'<path d="m5 5 14 14M19 5 5 19"/>',book:'<path d="M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3zM12 6v15"/>',
 clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 6v6l4 2"/>',
 weather:'<circle cx="12" cy="12" r="4.5"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2.3 2.3m11.4 11.4L20 20M4 20l2.3-2.3M17.7 6.3 20 4"/>',
 fullscreen:'<path d="M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6"/>',
 check:'<path d="m3 12 6 6L21 5"/>', wind:'<path d="M2 10h12q6 0 4-5t-5 1M3 14h15q5 0 3 5t-4-1"/>'
}
export function icon(name:string){return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="square" stroke-linejoin="miter">'+(paths[name]||'')+'</svg>'}
export function fillIcons(parent:ParentNode=document){parent.querySelectorAll<HTMLElement>('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon!))}
