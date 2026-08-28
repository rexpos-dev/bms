export const DEV_PROJECT_PRINT_STYLE = `
@media print {
  body * { visibility: hidden; }
  #dev-project-print, #dev-project-print * { visibility: visible; }
  #dev-project-print {
    display: block !important;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    background: #fff;
    color: #000;
    z-index: 99999;
  }
  @page { margin: 15mm; }
}
`;
