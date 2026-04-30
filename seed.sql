-- OTISAK Seed Data: Arhitektura racunara
-- ========================================

-- Subject
INSERT INTO otisak_subjects (id, name, code, description, created_by)
VALUES ('a1b2c3d4-1111-2222-3333-444455556666', 'Arhitektura racunara', 'AR', 'Osnove arhitekture racunarskih sistema, digitalni sistemi, procesori, memorije', (SELECT id FROM users WHERE role='admin' LIMIT 1))
ON CONFLICT DO NOTHING;

-- Students (ra<N>-2025, password: ftn — bcrypt hash of "ftn")
INSERT INTO users (email, password_hash, name, role, index_number) VALUES
  ('ra1-2025@ftn.uns.ac.rs',  '$2a$10$6hods4IFrEGvWgydUguQXe9ru/sTbWEPENvb0F.OcW90gGYmuo5yu', 'Marko Petrovic',     'student', 'ra1-2025'),
  ('ra2-2025@ftn.uns.ac.rs',  '$2a$10$6hods4IFrEGvWgydUguQXe9ru/sTbWEPENvb0F.OcW90gGYmuo5yu', 'Ana Jovanovic',      'student', 'ra2-2025'),
  ('ra3-2025@ftn.uns.ac.rs',  '$2a$10$6hods4IFrEGvWgydUguQXe9ru/sTbWEPENvb0F.OcW90gGYmuo5yu', 'Stefan Nikolic',     'student', 'ra3-2025'),
  ('ra4-2025@ftn.uns.ac.rs',  '$2a$10$6hods4IFrEGvWgydUguQXe9ru/sTbWEPENvb0F.OcW90gGYmuo5yu', 'Jelena Djordjevic',  'student', 'ra4-2025'),
  ('ra5-2025@ftn.uns.ac.rs',  '$2a$10$6hods4IFrEGvWgydUguQXe9ru/sTbWEPENvb0F.OcW90gGYmuo5yu', 'Nikola Stojanovic',  'student', 'ra5-2025'),
  ('ra6-2025@ftn.uns.ac.rs',  '$2a$10$6hods4IFrEGvWgydUguQXe9ru/sTbWEPENvb0F.OcW90gGYmuo5yu', 'Milica Ilic',        'student', 'ra6-2025'),
  ('ra7-2025@ftn.uns.ac.rs',  '$2a$10$6hods4IFrEGvWgydUguQXe9ru/sTbWEPENvb0F.OcW90gGYmuo5yu', 'Lazar Markovic',     'student', 'ra7-2025'),
  ('ra8-2025@ftn.uns.ac.rs',  '$2a$10$6hods4IFrEGvWgydUguQXe9ru/sTbWEPENvb0F.OcW90gGYmuo5yu', 'Tamara Pavlovic',    'student', 'ra8-2025'),
  ('ra9-2025@ftn.uns.ac.rs',  '$2a$10$6hods4IFrEGvWgydUguQXe9ru/sTbWEPENvb0F.OcW90gGYmuo5yu', 'Dusan Milosevic',    'student', 'ra9-2025'),
  ('ra10-2025@ftn.uns.ac.rs', '$2a$10$6hods4IFrEGvWgydUguQXe9ru/sTbWEPENvb0F.OcW90gGYmuo5yu', 'Maja Kovacevic',     'student', 'ra10-2025'),
  ('ra11-2025@ftn.uns.ac.rs', '$2a$10$6hods4IFrEGvWgydUguQXe9ru/sTbWEPENvb0F.OcW90gGYmuo5yu', 'Milos Todorovic',    'student', 'ra11-2025'),
  ('ra12-2025@ftn.uns.ac.rs', '$2a$10$6hods4IFrEGvWgydUguQXe9ru/sTbWEPENvb0F.OcW90gGYmuo5yu', 'Sara Popovic',       'student', 'ra12-2025'),
  ('ra13-2025@ftn.uns.ac.rs', '$2a$10$6hods4IFrEGvWgydUguQXe9ru/sTbWEPENvb0F.OcW90gGYmuo5yu', 'Aleksa Lazarevic',   'student', 'ra13-2025'),
  ('ra14-2025@ftn.uns.ac.rs', '$2a$10$6hods4IFrEGvWgydUguQXe9ru/sTbWEPENvb0F.OcW90gGYmuo5yu', 'Jovana Simic',       'student', 'ra14-2025'),
  ('ra15-2025@ftn.uns.ac.rs', '$2a$10$6hods4IFrEGvWgydUguQXe9ru/sTbWEPENvb0F.OcW90gGYmuo5yu', 'Filip Djukic',       'student', 'ra15-2025')
ON CONFLICT (email) DO NOTHING;

-- 15 Question Bank entries with answers
DO $$
DECLARE
  subj_id UUID := 'a1b2c3d4-1111-2222-3333-444455556666';
  admin_id UUID;
  q_id UUID;
BEGIN
  SELECT id INTO admin_id FROM users WHERE role = 'admin' LIMIT 1;

  -- Q1
  INSERT INTO otisak_question_bank (id, subject_id, type, text, points, tags, created_by, updated_by)
  VALUES ('a0000001-0000-0000-0000-000000000001', subj_id, 'text', 'Sta je ALU (aritmeticko-logicka jedinica)?', 2, ARRAY['procesori','osnove'], admin_id, admin_id)
  ON CONFLICT DO NOTHING RETURNING id INTO q_id;
  IF q_id IS NOT NULL THEN
    INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position) VALUES
      (q_id, 'Deo procesora zaduzen za aritmeticke i logicke operacije', true, 0),
      (q_id, 'Tip eksterne memorije', false, 1),
      (q_id, 'Protokol za mreznu komunikaciju', false, 2),
      (q_id, 'Softverski alat za kompajliranje', false, 3);
  END IF;

  -- Q2
  INSERT INTO otisak_question_bank (id, subject_id, type, text, points, tags, created_by, updated_by)
  VALUES ('a0000001-0000-0000-0000-000000000002', subj_id, 'text', 'Koji registar cuva adresu sledece instrukcije koja treba da se izvrsi?', 2, ARRAY['procesori','registri'], admin_id, admin_id)
  ON CONFLICT DO NOTHING RETURNING id INTO q_id;
  IF q_id IS NOT NULL THEN
    INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position) VALUES
      (q_id, 'Programski brojac (PC)', true, 0),
      (q_id, 'Akumulator (ACC)', false, 1),
      (q_id, 'Statusni registar (FLAGS)', false, 2),
      (q_id, 'Stek pokazivac (SP)', false, 3);
  END IF;

  -- Q3
  INSERT INTO otisak_question_bank (id, subject_id, type, text, points, tags, created_by, updated_by)
  VALUES ('a0000001-0000-0000-0000-000000000003', subj_id, 'text', 'Koja je razlika izmedju RAM i ROM memorije?', 2, ARRAY['memorija','osnove'], admin_id, admin_id)
  ON CONFLICT DO NOTHING RETURNING id INTO q_id;
  IF q_id IS NOT NULL THEN
    INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position) VALUES
      (q_id, 'RAM je privremena memorija koja gubi podatke po iskljucenju, ROM je trajna', true, 0),
      (q_id, 'RAM je sporiji od ROM-a', false, 1),
      (q_id, 'ROM se koristi kao radna memorija', false, 2),
      (q_id, 'Nema razlike, oba su isti tip memorije', false, 3);
  END IF;

  -- Q4
  INSERT INTO otisak_question_bank (id, subject_id, type, text, points, tags, created_by, updated_by)
  VALUES ('a0000001-0000-0000-0000-000000000004', subj_id, 'text', 'Sta je kes memorija (cache) i cemu sluzi?', 2, ARRAY['memorija','kes'], admin_id, admin_id)
  ON CONFLICT DO NOTHING RETURNING id INTO q_id;
  IF q_id IS NOT NULL THEN
    INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position) VALUES
      (q_id, 'Brza memorija izmedju procesora i RAM-a za ubrzanje pristupa podacima', true, 0),
      (q_id, 'Tip hard diska', false, 1),
      (q_id, 'Memorija za cuvanje BIOS-a', false, 2),
      (q_id, 'Graficka memorija', false, 3);
  END IF;

  -- Q5
  INSERT INTO otisak_question_bank (id, subject_id, type, text, points, tags, created_by, updated_by)
  VALUES ('a0000001-0000-0000-0000-000000000005', subj_id, 'text', 'Koliko bitova ima jedan bajt?', 1, ARRAY['osnove','binarni'], admin_id, admin_id)
  ON CONFLICT DO NOTHING RETURNING id INTO q_id;
  IF q_id IS NOT NULL THEN
    INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position) VALUES
      (q_id, '8', true, 0),
      (q_id, '4', false, 1),
      (q_id, '16', false, 2),
      (q_id, '32', false, 3);
  END IF;

  -- Q6
  INSERT INTO otisak_question_bank (id, subject_id, type, text, points, tags, created_by, updated_by)
  VALUES ('a0000001-0000-0000-0000-000000000006', subj_id, 'text', 'Sta je Von Neumannova arhitektura?', 2, ARRAY['arhitektura','osnove'], admin_id, admin_id)
  ON CONFLICT DO NOTHING RETURNING id INTO q_id;
  IF q_id IS NOT NULL THEN
    INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position) VALUES
      (q_id, 'Arhitektura gde se podaci i instrukcije cuvaju u istoj memoriji', true, 0),
      (q_id, 'Arhitektura sa odvojenom memorijom za podatke i instrukcije', false, 1),
      (q_id, 'Tip grafickog procesora', false, 2),
      (q_id, 'Operativni sistem', false, 3);
  END IF;

  -- Q7
  INSERT INTO otisak_question_bank (id, subject_id, type, text, points, tags, created_by, updated_by)
  VALUES ('a0000001-0000-0000-0000-000000000007', subj_id, 'text', 'Koja je funkcija upravljacke jedinice (CU) u procesoru?', 2, ARRAY['procesori','upravljanje'], admin_id, admin_id)
  ON CONFLICT DO NOTHING RETURNING id INTO q_id;
  IF q_id IS NOT NULL THEN
    INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position) VALUES
      (q_id, 'Dekodira instrukcije i upravlja radom ostalih komponenti procesora', true, 0),
      (q_id, 'Izvrsava aritmeticke operacije', false, 1),
      (q_id, 'Cuva podatke u memoriji', false, 2),
      (q_id, 'Povezuje procesor sa periferijama', false, 3);
  END IF;

  -- Q8
  INSERT INTO otisak_question_bank (id, subject_id, type, text, points, tags, created_by, updated_by)
  VALUES ('a0000001-0000-0000-0000-000000000008', subj_id, 'text', 'Sta je magistrala (bus) u racunarskom sistemu?', 2, ARRAY['magistrale','osnove'], admin_id, admin_id)
  ON CONFLICT DO NOTHING RETURNING id INTO q_id;
  IF q_id IS NOT NULL THEN
    INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position) VALUES
      (q_id, 'Skup vodova za prenos podataka, adresa i upravljackih signala', true, 0),
      (q_id, 'Tip procesora', false, 1),
      (q_id, 'Softverski interfejs', false, 2),
      (q_id, 'Vrsta memorije', false, 3);
  END IF;

  -- Q9
  INSERT INTO otisak_question_bank (id, subject_id, type, text, points, tags, created_by, updated_by)
  VALUES ('a0000001-0000-0000-0000-000000000009', subj_id, 'text', 'Sta je pipeline (protocna obrada) kod procesora?', 3, ARRAY['procesori','pipeline'], admin_id, admin_id)
  ON CONFLICT DO NOTHING RETURNING id INTO q_id;
  IF q_id IS NOT NULL THEN
    INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position) VALUES
      (q_id, 'Tehnika gde se vise instrukcija izvrsava paralelno u razlicitim fazama', true, 0),
      (q_id, 'Tip mreze za povezivanje racunara', false, 1),
      (q_id, 'Nacin skladistenja podataka na disku', false, 2),
      (q_id, 'Algoritam za sortiranje', false, 3);
  END IF;

  -- Q10
  INSERT INTO otisak_question_bank (id, subject_id, type, text, points, tags, created_by, updated_by)
  VALUES ('a0000001-0000-0000-0000-000000000010', subj_id, 'text', 'Koja je razlika izmedju RISC i CISC arhitektura?', 3, ARRAY['arhitektura','procesori'], admin_id, admin_id)
  ON CONFLICT DO NOTHING RETURNING id INTO q_id;
  IF q_id IS NOT NULL THEN
    INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position) VALUES
      (q_id, 'RISC ima jednostavne instrukcije fiksne duzine, CISC ima kompleksne instrukcije promenljive duzine', true, 0),
      (q_id, 'RISC je sporiji od CISC-a', false, 1),
      (q_id, 'CISC koristi manje registara od RISC-a', false, 2),
      (q_id, 'Nema sustinske razlike', false, 3);
  END IF;

  -- Q11
  INSERT INTO otisak_question_bank (id, subject_id, type, text, points, tags, created_by, updated_by)
  VALUES ('a0000001-0000-0000-0000-000000000011', subj_id, 'text', 'Sta je prekid (interrupt) u racunarskom sistemu?', 2, ARRAY['procesori','prekidi'], admin_id, admin_id)
  ON CONFLICT DO NOTHING RETURNING id INTO q_id;
  IF q_id IS NOT NULL THEN
    INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position) VALUES
      (q_id, 'Signal koji zahteva od procesora da prekine trenutni rad i obradi dogadjaj', true, 0),
      (q_id, 'Greska u programu', false, 1),
      (q_id, 'Iskljucivanje racunara', false, 2),
      (q_id, 'Brisanje memorije', false, 3);
  END IF;

  -- Q12
  INSERT INTO otisak_question_bank (id, subject_id, type, text, points, tags, created_by, updated_by)
  VALUES ('a0000001-0000-0000-0000-000000000012', subj_id, 'text', 'Kako funkcionise virtuelna memorija?', 3, ARRAY['memorija','virtuelna'], admin_id, admin_id)
  ON CONFLICT DO NOTHING RETURNING id INTO q_id;
  IF q_id IS NOT NULL THEN
    INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position) VALUES
      (q_id, 'Koristi deo hard diska kao prosirenje RAM-a pomocu stranicenja', true, 0),
      (q_id, 'Memorija koja ne postoji fizicki', false, 1),
      (q_id, 'Memorija u oblaku', false, 2),
      (q_id, 'Tip ROM memorije', false, 3);
  END IF;

  -- Q13
  INSERT INTO otisak_question_bank (id, subject_id, type, text, points, tags, created_by, updated_by)
  VALUES ('a0000001-0000-0000-0000-000000000013', subj_id, 'text', 'Koji su nivoi kes memorije (L1, L2, L3)?', 2, ARRAY['memorija','kes'], admin_id, admin_id)
  ON CONFLICT DO NOTHING RETURNING id INTO q_id;
  IF q_id IS NOT NULL THEN
    INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position) VALUES
      (q_id, 'L1 je najbrzi i najmanji, L2 je veci i sporiji, L3 je najveci i deli se izmedju jezgara', true, 0),
      (q_id, 'Svi nivoi su iste velicine i brzine', false, 1),
      (q_id, 'L3 je najbrzi nivo', false, 2),
      (q_id, 'Kes memorija ima samo jedan nivo', false, 3);
  END IF;

  -- Q14
  INSERT INTO otisak_question_bank (id, subject_id, type, text, points, tags, created_by, updated_by)
  VALUES ('a0000001-0000-0000-0000-000000000014', subj_id, 'text', 'Koja je razlika izmedju Harvard i Von Neumann arhitekture?', 3, ARRAY['arhitektura','osnove'], admin_id, admin_id)
  ON CONFLICT DO NOTHING RETURNING id INTO q_id;
  IF q_id IS NOT NULL THEN
    INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position) VALUES
      (q_id, 'Harvard ima odvojene memorije i magistrale za podatke i instrukcije, Von Neumann koristi zajednicke', true, 0),
      (q_id, 'Von Neumann je brzi od Harvard arhitekture', false, 1),
      (q_id, 'Harvard arhitektura se koristi samo u superkompjuterima', false, 2),
      (q_id, 'Obe arhitekture su identicne', false, 3);
  END IF;

  -- Q15
  INSERT INTO otisak_question_bank (id, subject_id, type, text, points, tags, created_by, updated_by)
  VALUES ('a0000001-0000-0000-0000-000000000015', subj_id, 'text', 'Sta su logicka kola (AND, OR, NOT, XOR)?', 2, ARRAY['digitalni','logika'], admin_id, admin_id)
  ON CONFLICT DO NOTHING RETURNING id INTO q_id;
  IF q_id IS NOT NULL THEN
    INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position) VALUES
      (q_id, 'Osnovni gradivni elementi digitalnih kola koji realizuju logicke funkcije', true, 0),
      (q_id, 'Softverski programi', false, 1),
      (q_id, 'Tipovi memorije', false, 2),
      (q_id, 'Mrezni protokoli', false, 3);
  END IF;

  -- Create exam with 10 questions from bank
  INSERT INTO otisak_exams (id, title, subject_id, description, duration_minutes, status, created_by, allow_review, shuffle_questions, shuffle_answers, pass_threshold, exam_mode, is_public)
  VALUES ('e1e2e3e4-aaaa-bbbb-cccc-ddddeeee0001', 'AR - Kolokvijum 1', subj_id, 'Prvi kolokvijum iz Arhitekture racunara', 45, 'draft', admin_id, true, true, true, 50, 'real', false)
  ON CONFLICT DO NOTHING;

END $$;

-- Copy 10 random questions from bank to exam (separate block)
DO $$
DECLARE
  bank_q RECORD;
  exam_q_id UUID;
  pos INT := 0;
BEGIN
  -- Skip if exam already has questions
  IF EXISTS (SELECT 1 FROM otisak_questions WHERE exam_id = 'e1e2e3e4-aaaa-bbbb-cccc-ddddeeee0001' LIMIT 1) THEN
    RETURN;
  END IF;

  FOR bank_q IN
    SELECT id, type, text, points FROM otisak_question_bank
    WHERE subject_id = 'a1b2c3d4-1111-2222-3333-444455556666' ORDER BY RANDOM() LIMIT 10
  LOOP
    INSERT INTO otisak_questions (exam_id, type, text, points, position, bank_question_id)
    VALUES ('e1e2e3e4-aaaa-bbbb-cccc-ddddeeee0001', bank_q.type, bank_q.text, bank_q.points, pos, bank_q.id)
    RETURNING id INTO exam_q_id;

    INSERT INTO otisak_answers (question_id, text, is_correct, position)
    SELECT exam_q_id, ba.text, ba.is_correct, ba.position
    FROM otisak_question_bank_answers ba WHERE ba.question_id = bank_q.id
    ORDER BY ba.position;

    pos := pos + 1;
  END LOOP;
END $$;
