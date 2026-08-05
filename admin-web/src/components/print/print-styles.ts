export const PRINT_STYLE = `
@media print {
  body * { visibility: hidden; }
  #job-order-print, #job-order-print * { visibility: visible; }
  /*
   * Absolute, not fixed. In paged media a fixed box is REPEATED on every page
   * by design, so the whole job order was being painted again on top of the
   * agreement once the output grew past one page. Absolute positioning takes
   * the subtree out of the app's layout while still letting it paginate.
   *
   * The page inset lives on @page below, not on padding here: padding applies
   * once to the whole box, which would leave every page after the first with
   * no top margin.
   */
  #job-order-print {
    display: block !important;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    background: #fff;
    color: #000;
    z-index: 99999;
  }
  /*
   * Fixed on purpose here — the per-page repeat that broke the container above
   * is exactly what a watermark wants, so it lands on every page. Do not
   * "fix" this one to absolute.
   */
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

  /* Applied per page, so every page keeps its inset — see the note above. */
  @page { margin: 15mm; }
}
`;
