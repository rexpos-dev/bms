export const PRINT_STYLE = `
@media print {
  body * { visibility: hidden; }
  #job-order-print, #job-order-print * { visibility: visible; }
  #job-order-print {
    display: block !important;
    position: fixed;
    inset: 0;
    background: #fff;
    color: #000;
    padding: 15mm;
    z-index: 99999;
  }
  #job-order-print::before {
    content: "CONFIDENTIAL";
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 80pt;
    font-weight: 900;
    color: rgba(0, 0, 0, 0.07);
    white-space: nowrap;
    letter-spacing: 0.15em;
    pointer-events: none;
    z-index: 99998;
  }
  .agreement-page { page-break-before: always; break-before: page; }
  @page { margin: 0; }
}
`;
