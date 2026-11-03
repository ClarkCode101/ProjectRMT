// Quick Reference: normal values, formulas and memory aids, searchable on /reference.
//
// ⚠️ STARTER SET. These are common adult reference values from standard textbooks,
// but ranges differ between labs, methods and books. Check each one against her reviewer
// (and the latest PRC / Board exam program) and edit freely: change a value, add a note, add or remove rows.
//
// subject: one of the six board subjects. kind: 'value' (a reference range), 'formula', or 'mnemonic'.

export type RefKind = 'value' | 'formula' | 'mnemonic'
export type RefSubject = 'CC' | 'MICRO' | 'HEMA' | 'BBIS' | 'CM' | 'HTMLE'
export type RefItem = { subject: RefSubject; kind: RefKind; title: string; value: string; notes?: string }

export const REFERENCE_ITEMS: RefItem[] = [
  // ---------- Clinical Chemistry ----------
  { subject: 'CC', kind: 'value', title: 'Fasting blood glucose', value: '70–100 mg/dL (3.9–5.6 mmol/L)', notes: '100–125 mg/dL = impaired fasting glucose; ≥126 mg/dL on two occasions = diabetes (ADA).' },
  { subject: 'CC', kind: 'value', title: 'HbA1c', value: 'Below 5.7%', notes: '5.7–6.4% = prediabetes; ≥6.5% = diabetes (ADA).' },
  { subject: 'CC', kind: 'value', title: 'BUN', value: '7–20 mg/dL' },
  { subject: 'CC', kind: 'value', title: 'Creatinine', value: 'M 0.7–1.3 · F 0.6–1.1 mg/dL' },
  { subject: 'CC', kind: 'value', title: 'Uric acid', value: 'M 3.5–7.2 · F 2.6–6.0 mg/dL' },
  { subject: 'CC', kind: 'value', title: 'Total cholesterol', value: 'Desirable below 200 mg/dL' },
  { subject: 'CC', kind: 'value', title: 'Triglycerides', value: 'Normal below 150 mg/dL' },
  { subject: 'CC', kind: 'value', title: 'HDL cholesterol', value: 'Low below 40 mg/dL · protective 60 mg/dL and up' },
  { subject: 'CC', kind: 'value', title: 'LDL cholesterol', value: 'Optimal below 100 mg/dL' },
  { subject: 'CC', kind: 'value', title: 'Sodium', value: '135–145 mmol/L' },
  { subject: 'CC', kind: 'value', title: 'Potassium', value: '3.5–5.1 mmol/L' },
  { subject: 'CC', kind: 'value', title: 'Chloride', value: '98–107 mmol/L' },
  { subject: 'CC', kind: 'value', title: 'Total calcium', value: '8.6–10.3 mg/dL' },
  { subject: 'CC', kind: 'value', title: 'Total bilirubin', value: '0.3–1.2 mg/dL' },
  { subject: 'CC', kind: 'value', title: 'Total protein · Albumin', value: '6.4–8.3 g/dL · 3.5–5.0 g/dL' },
  { subject: 'CC', kind: 'formula', title: 'Anion gap', value: 'Na⁺ − (Cl⁻ + HCO₃⁻)', notes: 'Usual reference about 8–16 mmol/L (without K⁺).' },
  { subject: 'CC', kind: 'formula', title: 'Friedewald LDL (mg/dL)', value: 'LDL = Total cholesterol − HDL − (Triglycerides ÷ 5)', notes: 'Not valid when triglycerides are 400 mg/dL or higher.' },
  { subject: 'CC', kind: 'formula', title: 'Calculated serum osmolality', value: '2 × Na⁺ + Glucose ÷ 18 + BUN ÷ 2.8', notes: 'Glucose and BUN in mg/dL; result in mOsm/kg.' },

  // ---------- Hematology ----------
  { subject: 'HEMA', kind: 'value', title: 'Hemoglobin', value: 'M 13.5–17.5 · F 12.0–15.5 g/dL' },
  { subject: 'HEMA', kind: 'value', title: 'Hematocrit', value: 'M 41–53% · F 36–46%' },
  { subject: 'HEMA', kind: 'value', title: 'RBC count', value: 'M 4.5–5.9 · F 4.0–5.2 × 10¹²/L' },
  { subject: 'HEMA', kind: 'value', title: 'WBC count', value: '4.5–11.0 × 10⁹/L' },
  { subject: 'HEMA', kind: 'value', title: 'Platelet count', value: '150–450 × 10⁹/L' },
  { subject: 'HEMA', kind: 'value', title: 'MCV · MCH · MCHC', value: '80–100 fL · 27–31 pg · 32–36 g/dL' },
  { subject: 'HEMA', kind: 'value', title: 'Reticulocyte count (adult)', value: '0.5–2.5%' },
  { subject: 'HEMA', kind: 'value', title: 'ESR (Westergren)', value: 'M 0–15 · F 0–20 mm/hr' },
  { subject: 'HEMA', kind: 'formula', title: 'MCV (fL)', value: 'Hct (%) × 10 ÷ RBC (× 10¹²/L)' },
  { subject: 'HEMA', kind: 'formula', title: 'MCH (pg)', value: 'Hgb (g/dL) × 10 ÷ RBC (× 10¹²/L)' },
  { subject: 'HEMA', kind: 'formula', title: 'MCHC (g/dL)', value: 'Hgb (g/dL) × 100 ÷ Hct (%)' },
  { subject: 'HEMA', kind: 'formula', title: 'Rule of three (normocytic, normochromic cells)', value: 'RBC × 3 ≈ Hgb · Hgb × 3 ≈ Hct (± 3)' },
  { subject: 'HEMA', kind: 'formula', title: 'Corrected WBC count (with nRBCs)', value: 'WBC × 100 ÷ (100 + nRBCs per 100 WBCs)' },
  { subject: 'HEMA', kind: 'formula', title: 'Corrected reticulocyte count', value: 'Retic % × patient Hct ÷ 45' },
  { subject: 'HEMA', kind: 'formula', title: 'Mentzer index', value: 'MCV ÷ RBC count', notes: 'Below 13 suggests thalassemia trait; above 13 suggests iron deficiency.' },

  // ---------- Clinical Microscopy (AUBF) ----------
  { subject: 'CM', kind: 'value', title: 'Urine specific gravity (random)', value: '1.003–1.035' },
  { subject: 'CM', kind: 'value', title: 'Urine pH (random)', value: '4.5–8.0' },
  { subject: 'CM', kind: 'value', title: 'Creatinine clearance', value: 'M 107–139 · F 87–107 mL/min' },
  { subject: 'CM', kind: 'formula', title: 'Creatinine clearance (mL/min)', value: '(Urine creatinine × urine volume per minute) ÷ plasma creatinine', notes: 'Correct for body size: × 1.73 ÷ body surface area (m²).' },
  { subject: 'CM', kind: 'value', title: 'CSF glucose', value: '60–70% of plasma glucose' },
  { subject: 'CM', kind: 'value', title: 'CSF protein', value: '15–45 mg/dL' },
  { subject: 'CM', kind: 'value', title: 'CSF WBC (adult)', value: '0–5 cells/µL' },

  // ---------- Blood Banking & Immunoserology ----------
  { subject: 'BBIS', kind: 'value', title: 'Red cell storage temperature', value: '1–6 °C' },
  { subject: 'BBIS', kind: 'value', title: 'Red cell shelf life', value: 'CPDA-1: 35 days · Additive solution: 42 days' },
  { subject: 'BBIS', kind: 'value', title: 'Platelets (stored)', value: '20–24 °C with gentle agitation, 5 days' },
  { subject: 'BBIS', kind: 'value', title: 'Fresh frozen plasma', value: '−18 °C or colder, 1 year' },
  { subject: 'BBIS', kind: 'value', title: 'Rh immune globulin (one 300 µg dose)', value: 'Covers 30 mL of fetal whole blood (15 mL of red cells)' },
  { subject: 'BBIS', kind: 'mnemonic', title: 'Cold (IgM) antibodies', value: 'Lewis, I, P, M, N', notes: '“Lewis Is Pretty Mild & Nice.” Usually react at room temperature or colder.' },
  { subject: 'BBIS', kind: 'mnemonic', title: 'Warm (IgG) antibodies', value: 'Rh, Kell, Duffy, Kidd, S/s', notes: 'React at 37 °C / AHG phase; the clinically significant ones.' },
  { subject: 'BBIS', kind: 'mnemonic', title: 'Kidd antibodies', value: '“Kidd kills”', notes: 'Known for delayed hemolytic transfusion reactions; levels can drop below detection.' },
  { subject: 'BBIS', kind: 'mnemonic', title: 'Antigens destroyed by enzymes (ficin, papain)', value: 'Duffy (Fyᵃ, Fyᵇ) and M, N, S', notes: 'Enhanced by enzymes: Rh, Kidd, Lewis, I, P.' },

  // ---------- Microbiology & Parasitology ----------
  { subject: 'MICRO', kind: 'mnemonic', title: 'Catalase test (Gram-positive cocci)', value: 'Staphylococcus = positive · Streptococcus = negative' },
  { subject: 'MICRO', kind: 'mnemonic', title: 'Coagulase-positive staph', value: 'Staphylococcus aureus' },
  { subject: 'MICRO', kind: 'mnemonic', title: 'Lactose fermenters on MacConkey (pink colonies)', value: '“CEEK”: Citrobacter, E. coli, Enterobacter, Klebsiella' },

  // ---------- Histopath, Cytotech, MT Laws & Ethics ----------
  { subject: 'HTMLE', kind: 'value', title: '10% neutral buffered formalin', value: 'About 4% formaldehyde', notes: 'Fixative volume about 10–20 times the tissue volume.' },
  { subject: 'HTMLE', kind: 'value', title: 'Routine paraffin section thickness', value: '3–5 µm' },
  { subject: 'HTMLE', kind: 'mnemonic', title: 'Papanicolaou stain', value: 'Hematoxylin (nuclei), OG-6, EA (cytoplasm)' },
  { subject: 'HTMLE', kind: 'value', title: 'RA 5527', value: 'Philippine Medical Technology Act of 1969' },
  { subject: 'HTMLE', kind: 'value', title: 'RA 4688', value: 'Clinical Laboratory Law (1966)' },
]
