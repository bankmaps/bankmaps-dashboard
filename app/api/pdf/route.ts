// app/api/pdf/route.ts
// Place this file at: app/api/pdf/route.ts
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Letter landscape at 96dpi
const PAGE_WIDTH_PX  = 1056;
const PAGE_HEIGHT_PX = 816;

async function getBrowser() {
  const chromium  = (await import("@sparticuz/chromium")).default;
  const puppeteer = (await import("puppeteer-core")).default;
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: PAGE_WIDTH_PX, height: PAGE_HEIGHT_PX },
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pageUrl = searchParams.get("url");
  const mode    = searchParams.get("mode");    // "current" | "series"
  const mapIdx  = searchParams.get("mapIdx");  // "0" | "1" | "2"
  const token   = searchParams.get("token");

  if (!pageUrl || !mode || !token) {
    return NextResponse.json({ error: "Missing required params" }, { status: 400 });
  }

  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();

    // Inject auth token so the page loads correctly behind login
    await page.evaluateOnNewDocument((tok: string) => {
      localStorage.setItem("jwt_token", tok);
    }, token);

    const renderMap = async (url: string): Promise<Buffer> => {
      await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
      await page.waitForSelector(".mapboxgl-canvas", { timeout: 20000 });
      await new Promise(r => setTimeout(r, 3000)); // let map tiles finish rendering
      await page.addStyleTag({
        content: `.aa-no-print { display: none !important; } body { margin: 0; padding: 0; }`
      });
      return await page.pdf({
        width:  PAGE_WIDTH_PX + "px",
        height: PAGE_HEIGHT_PX + "px",
        printBackground: true,
        margin: { top: "38px", right: "38px", bottom: "38px", left: "38px" },
      }) as unknown as Buffer;
    };

    if (mode === "current") {
      const idx = mapIdx ? parseInt(mapIdx) : 0;
      const url = pageUrl + (pageUrl.includes("?") ? "&" : "?") + "mapIdx=" + idx + "&pdf=1";
      const pdf = await renderMap(url);
      return new NextResponse(pdf, {
        status: 200,
        headers: {
          "Content-Type":        "application/pdf",
          "Content-Disposition": "attachment; filename=map-" + (idx + 1) + ".pdf",
        },
      });

    } else {
      // Merge all 3 maps into one PDF using pdf-lib
      const { PDFDocument } = await import("pdf-lib");
      const mergedPdf = await PDFDocument.create();

      for (let i = 0; i < 3; i++) {
        const url    = pageUrl + (pageUrl.includes("?") ? "&" : "?") + "mapIdx=" + i + "&pdf=1";
        const pdfBuf = await renderMap(url);
        const srcDoc = await PDFDocument.load(pdfBuf);
        const [copiedPage] = await mergedPdf.copyPages(srcDoc, [0]);
        mergedPdf.addPage(copiedPage);
      }

      const mergedBytes = await mergedPdf.save();
      return new NextResponse(mergedBytes, {
        status: 200,
        headers: {
          "Content-Type":        "application/pdf",
          "Content-Disposition": "attachment; filename=assessment-area-maps.pdf",
        },
      });
    }

  } catch (err: any) {
    console.error("[PDF] Error:", err);
    return NextResponse.json({ error: err.message || "PDF generation failed" }, { status: 500 });
  } finally {
    if (browser) await browser.close();
  }
}
