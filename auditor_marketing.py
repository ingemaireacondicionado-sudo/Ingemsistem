import sys
import requests
from bs4 import BeautifulSoup
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib import colors

def analizar_web(url):
    """Extrae el contenido principal de la página web del cliente."""
    print(f"Navegando en {url}...")
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')

        # Extraer título y textos principales
        titulo = soup.title.string if soup.title else 'Sin título'
        parrafos = [p.text.strip() for p in soup.find_all('p') if len(p.text.strip()) > 20]
        texto_completo = " ".join(parrafos)[:3000] # Limitamos a 3000 caracteres para el análisis

        return titulo, texto_completo
    except Exception as e:
        print(f"Error al acceder a la web: {e}")
        return None, None

def generar_pdf(url, titulo, analisis_claude, nombre_archivo="Reporte_Auditoria.pdf"):
    """Genera un PDF profesional con el análisis."""
    doc = SimpleDocTemplate(nombre_archivo, pagesize=A4)
    estilos = getSampleStyleSheet()

    # Estilo personalizado
    estilo_titulo = estilos['Heading1']
    estilo_titulo.textColor = colors.HexColor("#003366")
    estilo_normal = estilos['Normal']
    estilo_normal.fontSize = 11
    estilo_normal.spaceAfter = 12

    contenido = []

    # Encabezado
    contenido.append(Paragraph("Auditoría Comercial y Oportunidades de Mejora", estilo_titulo))
    contenido.append(Spacer(1, 12))
    contenido.append(Paragraph(f"<b>Sitio Web Analizado:</b> {url}", estilo_normal))
    contenido.append(Paragraph(f"<b>Título Original:</b> {titulo}", estilo_normal))
    contenido.append(Spacer(1, 20))

    # Cuerpo del reporte (Generado por Claude)
    for linea in analisis_claude.split('\n'):
        if linea.strip():
            # Si la línea parece un subtítulo
            if linea.startswith('##') or linea.isupper():
                contenido.append(Paragraph(linea.replace('##', '').strip(), estilos['Heading2']))
            else:
                contenido.append(Paragraph(linea.strip(), estilo_normal))

    doc.build(contenido)
    print(f"¡Éxito! Reporte guardado como: {nombre_archivo}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python auditor_marketing.py <URL> <Archivo_Analisis_Claude.txt>")
        sys.exit(1)

    url_objetivo = sys.argv[1]
    archivo_texto = sys.argv[2]

    # Leer el análisis que Claude Code generó previamente
    try:
        with open(archivo_texto, 'r', encoding='utf-8') as f:
            analisis = f.read()
    except Exception as e:
        print(f"Error al leer el archivo de análisis: {e}")
        sys.exit(1)

    titulo_web, contenido_web = analizar_web(url_objetivo)

    if titulo_web:
        nombre_pdf = f"Reporte_{url_objetivo.replace('https://', '').replace('http://', '').split('/')[0]}.pdf"
        generar_pdf(url_objetivo, titulo_web, analisis, nombre_pdf)
