// Webben har ingen annan nedladdningsyta - CSV-exporten är den första.
// Blob + object-URL + ett tillfälligt <a download> är standardmönstret.
export function downloadTextFile(
  fileName: string,
  text: string,
  mimeType: string,
): void {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
