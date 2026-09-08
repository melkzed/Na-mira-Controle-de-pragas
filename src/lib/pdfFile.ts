/**
 * Geração do arquivo PDF para download direto.
 *
 * A impressão normal (`openPrint`) abre uma janela e depende de o usuário
 * escolher "Salvar como PDF". Aqui o arquivo é montado no próprio navegador e
 * baixado de uma vez, sem janela e sem caixa de diálogo.
 *
 * O mesmo HTML dos documentos é renderizado num iframe oculto com largura de
 * folha A4, fotografado com html2canvas e paginado no jsPDF. As bibliotecas
 * entram por import dinâmico: só são baixadas quando alguém clica em baixar,
 * então o pacote inicial do app não cresce.
 */
import { toast } from '@/store/toastStore';

/** Largura útil de uma folha A4 a 96dpi (210mm), já descontada nada — o CSS
 *  do documento tem as próprias margens internas. */
const A4_WIDTH_PX = 794;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/** Transforma o título do documento em um nome de arquivo aceitável. */
export function fileNameFor(title: string): string {
  const slug = title
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // tira acentos
    .replace(/[^\w\s.-]/g, ' ')                          // # · / viram espaço
    .trim().replace(/\s+/g, '-').toLowerCase();
  return `${slug || 'documento'}.pdf`;
}

/** Renderiza o HTML num iframe fora da tela e devolve o elemento a fotografar. */
function mountOffscreen(html: string): Promise<{ iframe: HTMLIFrameElement; body: HTMLElement }> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    // Fora da tela em vez de display:none — elemento sem layout não é medido
    // pelo html2canvas e sairia em branco.
    iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_WIDTH_PX}px;height:1200px;border:0;visibility:hidden`;
    iframe.onload = () => {
      const doc = iframe.contentDocument;
      if (!doc?.body) { reject(new Error('iframe sem documento')); return; }
      // Espera as imagens (logo e assinaturas, que são data URLs) decodificarem.
      const imgs = Array.from(doc.images);
      const pronto = Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); }))));
      pronto.then(() => resolve({ iframe, body: doc.body }));
    };
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) { iframe.remove(); reject(new Error('iframe sem documento')); return; }
    // O documento impresso traz um script que chama window.print(); no
    // download ele não deve rodar.
    doc.open();
    doc.write(html.replace(/<script[\s\S]*?<\/script>/gi, ''));
    // O documento é desenhado para a folha impressa, onde `min-height: 100%`
    // estica a moldura até o fim da página. No download isso viraria uma
    // segunda folha em branco — aqui a altura tem de ser só a do conteúdo.
    const ajuste = doc.createElement('style');
    ajuste.textContent = 'html,body{height:auto!important}.doc{min-height:0!important}';
    doc.head.appendChild(ajuste);
    doc.close();
  });
}

/**
 * Monta e baixa o PDF do documento. Devolve quando o arquivo foi entregue.
 * Falhas viram aviso na tela — o usuário sempre tem a impressão como saída.
 */
export async function savePdf(title: string, html: string): Promise<void> {
  let iframe: HTMLIFrameElement | undefined;
  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);
    const mounted = await mountOffscreen(html);
    iframe = mounted.iframe;
    // Altura real do conteúdo, para o iframe não cortar documentos longos.
    const alturaConteudo = Math.max(mounted.body.scrollHeight, mounted.body.offsetHeight);
    iframe.style.height = `${alturaConteudo}px`;

    const canvas = await html2canvas(mounted.body, {
      scale: 2,               // 2x deixa o texto legível sem estourar o tamanho
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: A4_WIDTH_PX,
      width: A4_WIDTH_PX,
      height: alturaConteudo,
    });

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    // Escala a imagem para a largura da folha; o que passar de 297mm vira
    // página nova, deslocando a mesma imagem para cima.
    const alturaTotalMm = (canvas.height * A4_WIDTH_MM) / canvas.width;
    const imagem = canvas.toDataURL('image/jpeg', 0.92);
    let restante = alturaTotalMm;
    let posicao = 0;
    while (restante > 0.5) {
      if (posicao > 0) pdf.addPage();
      pdf.addImage(imagem, 'JPEG', 0, -posicao, A4_WIDTH_MM, alturaTotalMm);
      posicao += A4_HEIGHT_MM;
      restante -= A4_HEIGHT_MM;
    }
    pdf.save(fileNameFor(title));
  } catch (e) {
    console.error('Falha ao gerar o PDF', e);
    toast('Não foi possível gerar o arquivo. Use o botão de imprimir e escolha "Salvar como PDF".', { tone: 'danger' });
  } finally {
    iframe?.remove();
  }
}
