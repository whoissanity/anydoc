import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { exportFormFdf, importFormData, readFormValues } from "@/lib/edit/forms";

async function formPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  const name = form.createTextField("name");
  name.addToPage(page, { x: 20, y: 700, width: 160, height: 24 });
  const agree = form.createCheckBox("agree");
  agree.addToPage(page, { x: 20, y: 660, width: 16, height: 16 });
  const choice = form.createDropdown("choice");
  choice.addOptions(["One", "Two"]);
  choice.addToPage(page, { x: 20, y: 620, width: 160, height: 24 });
  return doc.save();
}

describe("form data import/export", () => {
  it("exports AcroForm values to FDF", async () => {
    const doc = await PDFDocument.load(await formPdf());
    const form = doc.getForm();
    (form.getTextField("name") as { setText: (value: string) => void }).setText("Ada");
    (form.getCheckBox("agree") as { check: () => void }).check();
    (form.getDropdown("choice") as { select: (value: string) => void }).select("Two");
    const base = await doc.save();

    const fdf = new TextDecoder().decode(await exportFormFdf(base));
    expect(fdf.startsWith("%FDF-1.2")).toBe(true);
    expect(fdf).toContain("004100640061");
    expect(fdf).toContain("00540077006F");
  });

  it("imports FDF values into matching fields and reports skipped fields", async () => {
    const base = await formPdf();
    const fdf = `%FDF-1.2
1 0 obj
<< /FDF << /Fields [
<< /T <FEFF006E0061006D0065> /V <FEFF0041006400610020004C006F0076> >>
<< /T <FEFF00610067007200650065> /V <FEFF005900650073> >>
<< /T (missing) /V (ignored) >>
] >> >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF`;
    const result = await importFormData(base, fdf);
    expect(result).toMatchObject({ filled: 2, skipped: 1 });
    const values = await readFormValues(result.bytes);
    expect(values.name).toBe("Ada Lov");
    expect(values.agree).toBe("Yes");
  });

  it("imports XFDF fields", async () => {
    const base = await formPdf();
    const xfdf = `<?xml version="1.0" encoding="UTF-8"?>
<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">
  <fields>
    <field name="name"><value>Grace</value></field>
    <field name="choice"><value>One</value></field>
  </fields>
</xfdf>`;
    const result = await importFormData(base, xfdf);

    expect(result.filled).toBe(2);
    expect((await readFormValues(result.bytes)).name).toBe("Grace");
  });
});