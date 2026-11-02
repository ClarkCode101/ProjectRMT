-- Subjects and a starter topic list. Safe to run more than once.
-- ⚠️ Double-check weights and topics against the latest PRC / Board of Medical
--    Technology exam program (PROJECT_PLAN.md §2).

insert into subjects (code, name, weight, sort_order) values
  ('CC',    'Clinical Chemistry',                                            0.20, 1),
  ('MICRO', 'Microbiology & Parasitology',                                   0.20, 2),
  ('HEMA',  'Hematology',                                                    0.20, 3),
  ('BBIS',  'Blood Banking & Immunoserology',                                0.20, 4),
  ('CM',    'Clinical Microscopy (AUBF)',                                    0.10, 5),
  ('HTMLE', 'Histopathologic Techniques, Cytotechnology, MT Laws & Ethics',  0.10, 6)
on conflict (code) do update
  set name = excluded.name, weight = excluded.weight, sort_order = excluded.sort_order;

insert into topics (subject_id, name)
select s.id, t.name
from (values
  ('CC', 'Carbohydrates'), ('CC', 'Lipids & Lipoproteins'), ('CC', 'Proteins'),
  ('CC', 'Enzymes'), ('CC', 'Non-protein Nitrogen'), ('CC', 'Electrolytes'),
  ('CC', 'Liver Function'), ('CC', 'Endocrinology'), ('CC', 'Toxicology & TDM'),
  ('CC', 'Instrumentation & QC'),

  ('MICRO', 'Bacteriology'), ('MICRO', 'Mycobacteriology'), ('MICRO', 'Mycology'),
  ('MICRO', 'Virology'), ('MICRO', 'Parasitology'), ('MICRO', 'Lab Safety & Sterilization'),

  ('HEMA', 'Hematopoiesis'), ('HEMA', 'RBC Indices & Morphology'), ('HEMA', 'Anemias'),
  ('HEMA', 'WBC Disorders'), ('HEMA', 'Coagulation'), ('HEMA', 'Hematology Procedures'),

  ('BBIS', 'ABO & H System'), ('BBIS', 'Rh System'), ('BBIS', 'Antiglobulin Testing'),
  ('BBIS', 'Blood Components & Storage'), ('BBIS', 'Transfusion Reactions & HDFN'),
  ('BBIS', 'Immunology Basics'), ('BBIS', 'Serologic Tests'),

  ('CM', 'Physical Exam of Urine'), ('CM', 'Chemical Exam of Urine'),
  ('CM', 'Urine Sediment'), ('CM', 'Body Fluids'), ('CM', 'Fecalysis'),

  ('HTMLE', 'Fixation'), ('HTMLE', 'Tissue Processing'), ('HTMLE', 'Staining'),
  ('HTMLE', 'Cytology'), ('HTMLE', 'MT Laws'), ('HTMLE', 'Ethics')
) as t(code, name)
join subjects s on s.code = t.code
on conflict (subject_id, name) do nothing;
