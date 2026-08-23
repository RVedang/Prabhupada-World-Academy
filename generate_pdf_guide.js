const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function buildDetailedPdf() {
  const outputPath = path.join(process.cwd(), 'public', 'Prabhupada_World_Academy_Workflow_Guide.pdf');
  const rootPath = path.join(process.cwd(), 'Prabhupada_World_Academy_Workflow_Guide.pdf');
  const brainPath = path.join('/home/vedanarayana_das/.gemini/antigravity-ide/brain/2f44b42e-8119-46be-b8c6-aa1fcfff0fff', 'Prabhupada_World_Academy_Workflow_Guide.pdf');

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 40, bottom: 45, left: 40, right: 40 },
    bufferPages: true,
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  // Color Palette
  const C_HEADER_BG = '#7C2D12';   // Deep Terracotta / Saffron
  const C_PRIMARY = '#9A3412';     // Saffron / Rust
  const C_PRIMARY_LIGHT = '#FFEDD5';
  const C_DARK = '#0F172A';        // Slate 900
  const C_TEXT = '#1E293B';        // Slate 800
  const C_MUTED = '#64748B';       // Slate 500
  const C_ACCENT = '#0369A1';      // Blue 700
  const C_ACCENT_LIGHT = '#E0F2FE';
  const C_SUCCESS = '#15803D';     // Green 700
  const C_SUCCESS_LIGHT = '#DCFCE7';
  const C_WARNING = '#B45309';     // Amber 700
  const C_WARNING_LIGHT = '#FEF3C7';
  const C_CARD_BG = '#F8FAFC';     // Slate 50
  const C_BORDER = '#E2E8F0';      // Slate 200

  const PAGE_WIDTH = 515; // 595 - 80 margins
  const LEFT_X = 40;

  // Helper Functions
  function drawRunningHeader(title) {
    doc.save();
    doc.rect(LEFT_X, 18, PAGE_WIDTH, 16).fill('#FFF7ED');
    doc.fillColor(C_PRIMARY).fontSize(7.5).font('Helvetica-Bold')
       .text(`PRABHUPADA WORLD ACADEMY — ${title.toUpperCase()}`, LEFT_X + 8, 22, { width: PAGE_WIDTH - 16, align: 'left' });
    doc.restore();
    doc.y = 44;
  }

  function drawSectionBanner(num, title) {
    doc.moveDown(0.6);
    const startY = doc.y;
    doc.save();
    doc.roundedRect(LEFT_X, startY, PAGE_WIDTH, 24, 4).fill(C_PRIMARY);
    doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica-Bold')
       .text(`${num}. ${title.toUpperCase()}`, LEFT_X + 10, startY + 6, { width: PAGE_WIDTH - 20 });
    doc.restore();
    doc.y = startY + 30;
  }

  function drawSubSectionTitle(title) {
    doc.moveDown(0.4);
    const y = doc.y;
    doc.fillColor(C_DARK).fontSize(10.5).font('Helvetica-Bold').text(title, LEFT_X);
    doc.save().strokeColor(C_PRIMARY).lineWidth(1.5).moveTo(LEFT_X, doc.y + 2).lineTo(LEFT_X + 160, doc.y + 2).stroke().restore();
    doc.moveDown(0.35);
  }

  function drawCallout(title, text, type = 'info') {
    const bg = type === 'success' ? C_SUCCESS_LIGHT : type === 'warning' ? C_WARNING_LIGHT : type === 'primary' ? C_PRIMARY_LIGHT : C_ACCENT_LIGHT;
    const border = type === 'success' ? C_SUCCESS : type === 'warning' ? C_WARNING : type === 'primary' ? C_PRIMARY : C_ACCENT;
    
    doc.font('Helvetica').fontSize(8.5);
    const textHeight = doc.heightOfString(text, { width: PAGE_WIDTH - 24 });
    const totalHeight = textHeight + (title ? 22 : 12);

    if (doc.y + totalHeight > 760) doc.addPage();

    const startY = doc.y;
    doc.save();
    doc.roundedRect(LEFT_X, startY, PAGE_WIDTH, totalHeight, 4).fill(bg);
    doc.lineWidth(2.5).strokeColor(border).moveTo(LEFT_X, startY).lineTo(LEFT_X, startY + totalHeight).stroke();

    let textY = startY + 6;
    if (title) {
      doc.fillColor(border).font('Helvetica-Bold').fontSize(9).text(title, LEFT_X + 10, textY, { width: PAGE_WIDTH - 20 });
      textY += 13;
    }
    doc.fillColor(C_TEXT).font('Helvetica').fontSize(8.3).text(text, LEFT_X + 10, textY, { width: PAGE_WIDTH - 20, lineGap: 2 });
    doc.restore();

    doc.y = startY + totalHeight + 7;
  }

  function drawCard(title, items, options = {}) {
    const width = options.width || PAGE_WIDTH;
    const x = options.x || LEFT_X;
    
    doc.font('Helvetica').fontSize(8.2);
    let contentHeight = 20;
    items.forEach(it => {
      contentHeight += doc.heightOfString(`• ${it}`, { width: width - 20 }) + 3.5;
    });

    if (doc.y + contentHeight > 760) doc.addPage();

    const startY = doc.y;
    doc.save();
    doc.roundedRect(x, startY, width, contentHeight + 4, 4).fill(C_CARD_BG).strokeColor(C_BORDER).lineWidth(1).stroke();
    doc.fillColor(C_PRIMARY).font('Helvetica-Bold').fontSize(9.5).text(title, x + 8, startY + 6, { width: width - 16 });
    
    let currentY = startY + 20;
    doc.fillColor(C_TEXT).font('Helvetica').fontSize(8.2);
    items.forEach(it => {
      const itHeight = doc.heightOfString(`• ${it}`, { width: width - 20 });
      doc.text(`• ${it}`, x + 10, currentY, { width: width - 20, lineGap: 1.5 });
      currentY += itHeight + 3.5;
    });
    doc.restore();

    doc.y = startY + contentHeight + 9;
  }

  function drawTable(headers, rows, colWidths) {
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    const startY = doc.y;
    const headerHeight = 18;

    if (startY + (rows.length + 1) * 20 > 760) doc.addPage();

    let currentY = doc.y;

    // Header Row
    doc.save();
    doc.roundedRect(LEFT_X, currentY, totalWidth, headerHeight, 3).fill(C_DARK);
    let curX = LEFT_X;
    headers.forEach((h, idx) => {
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8).text(h, curX + 4, currentY + 5, { width: colWidths[idx] - 8 });
      curX += colWidths[idx];
    });
    doc.restore();
    currentY += headerHeight + 2;

    // Rows
    rows.forEach((r, rowIdx) => {
      doc.save();
      const rowBg = rowIdx % 2 === 0 ? '#FFFFFF' : '#F1F5F9';
      doc.rect(LEFT_X, currentY, totalWidth, 18).fill(rowBg);
      doc.rect(LEFT_X, currentY, totalWidth, 18).strokeColor(C_BORDER).lineWidth(0.5).stroke();

      let cellX = LEFT_X;
      r.forEach((cell, colIdx) => {
        const isBold = colIdx === 0;
        doc.fillColor(C_TEXT).font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.8)
           .text(String(cell), cellX + 4, currentY + 4.5, { width: colWidths[colIdx] - 8, ellipsis: true });
        cellX += colWidths[colIdx];
      });
      doc.restore();
      currentY += 18;
    });

    doc.y = currentY + 6;
  }

  // =========================================================================
  // PAGE 1: EXECUTIVE HERO COVER & OVERVIEW
  // =========================================================================
  
  // Hero Cover Header
  doc.save();
  doc.rect(0, 0, 595, 195).fill(C_HEADER_BG);
  doc.rect(0, 190, 595, 5).fill('#F59E0B'); // Gold Divider

  doc.fillColor('#FEF3C7').fontSize(10).font('Helvetica-Bold')
     .text('SRILA PRABHUPADA WORLD ACADEMY & FOLK ECOSYSTEM', LEFT_X, 35, { align: 'center', width: PAGE_WIDTH });
  
  doc.fillColor('#FFFFFF').fontSize(20).font('Helvetica-Bold')
     .text('COMPLETE APPLICATION WORKFLOW & OPERATIONAL MANUAL', LEFT_X, 55, { align: 'center', width: PAGE_WIDTH });

  doc.fillColor('#FDE68A').fontSize(9.5).font('Helvetica')
     .text('The Definitive 360° Guide to Roles, Sadhana Tracking, Supervisor CRM, Mentorship & Administration', LEFT_X, 110, { align: 'center', width: PAGE_WIDTH });

  doc.roundedRect(120, 145, 355, 24, 12).fill('rgba(0,0,0,0.3)');
  doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold')
     .text('Official Platform Documentation • Dual-Segment Real-Time Architecture', 120, 152, { align: 'center', width: 355 });
  doc.restore();

  doc.y = 210;

  drawSectionBanner('1', 'Executive Summary & Core Mission');

  doc.fillColor(C_TEXT).fontSize(8.8).font('Helvetica').text(
    'Prabhupada World Academy is an enterprise-grade digital platform designed to cultivate strict personal spiritual discipline, transparent community mentorship, grassroots study group leadership, and structured preaching outreach. It harmonizes ancient Vedic devotional standards with modern cloud and mobile technology.',
    { width: PAGE_WIDTH, lineGap: 2.2 }
  );
  doc.moveDown(0.5);

  drawCallout(
    '🏛️ Dual-Segment Community Architecture (PW vs FOLK)',
    '1. Prabhupada World (PW Segment): The global community of practitioners and families focused on daily home and temple sadhana, Srila Prabhupada book distribution, spiritual accountability, and lifelong progression.\n' +
    '2. FOLK Segment (Friends of Lord Krishna): The youth, university, and bachelor residency wing focused on student mentorship, hostel/residency cleanliness, weekly Bhakti Vriksha groups, and structured training milestones (from Jigyasa to Diksha).',
    'primary'
  );

  drawSubSectionTitle('Core Architectural Pillars');

  const pillars = [
    'Daily Sadhana Accountability: Enforces structured daily logging of chanting (16+ rounds across 4 time intervals), Brahma-Muhurta wake-up, book reading, lectures heard, seva, and cleanliness.',
    'Mentorship Visibility: Provides Sadhana Mentors and Guides with real-time compliance rosters, historical scorecards, trend charts, and 1-on-1 counseling record-keeping.',
    'Supervisor Preaching Outreach CRM: Equips Bhakti Vriksha Supervisors with a field CRM to log daily Calling Minutes, 1-on-1 preaching sessions, Book Distribution, RDUA study, and new contacts collected.',
    'Multi-Channel Automated Reminders: Delivers instantaneous in-app toasts and OS-level Web Push notifications across scheduled night and morning reminder slots.',
    'Role-Based Governance: Centralized Super Admin command center for user approvals, guide assignments, segment overrides, and macro-analytics.'
  ];
  drawCard('Five Foundational Pillars of the Platform', pillars);

  // =========================================================================
  // PAGE 2: USER ROLES, ACCESS CONTROL & HIERARCHY
  // =========================================================================
  doc.addPage();
  drawRunningHeader('ROLES, PERMISSIONS & SYSTEM HIERARCHY');
  drawSectionBanner('2', 'Granular Role-Based Access Control (RBAC)');

  doc.fillColor(C_TEXT).fontSize(8.6).font('Helvetica').text(
    'The platform operates on a strict multi-tier hierarchy where user roles determine visible dashboards, data access scopes, notification privileges, and management capabilities:',
    { width: PAGE_WIDTH, lineGap: 2 }
  );
  doc.moveDown(0.4);

  const roleTableHeaders = ['Role / Persona', 'Segment Scope', 'Primary Responsibilities', 'Visible Dashboard'];
  const roleTableRows = [
    ['Sadhaka (User)', 'PW / FOLK', 'Daily sadhana submission, personal streak analysis, BV group participation', 'User / Sadhana Dashboard'],
    ['Sadhana Mentor / Guide', 'PW / FOLK', 'Mentee roster compliance, scorecards review, 1-on-1 counseling, transfers', 'Guide / Mentor Dashboard'],
    ['BV Supervisor', 'PW / FOLK', 'Bhakti Vriksha group leadership, daily preaching logging (Calling, Books, RDUA)', 'Supervisor / BV Dashboard'],
    ['RGF / RGSF', 'FOLK Residency', 'Residency Guide Facilitator overseeing multiple supervisors and groups', 'RGF / RGSF Dashboard'],
    ['Super Admin / PW Admin', 'Platform-wide', 'Master administration, user approvals, guide assignments, push broadcasts', 'Super Admin Command Center']
  ];
  drawTable(roleTableHeaders, roleTableRows, [100, 75, 210, 130]);

  drawSubSectionTitle('Detailed Persona Profiles');

  const p1 = [
    'Enters daily sadhana (chanting rounds, rising time, book reading minutes, classes heard, service).',
    'Views personal performance stats: Sadhana Score (0–100%), historical compliance graphs, unbroken streaks.',
    'Connects with assigned Guide / Mentor and accesses scheduled Bhakti Vriksha meetings.'
  ];
  drawCard('1. Sadhaka / Practitioner (Regular Mentee)', p1);

  const p2 = [
    'Assigned a cohort of devotees; monitors live daily submission compliance (Submitted vs Pending).',
    'Drills down into devotee scorecards (wake-up consistency, chanting focus, reading volume).',
    'Logs confidential 1-on-1 counseling notes and coordinates group Zoom / Google Meet sessions.'
  ];
  drawCard('2. Sadhana Mentor / Guide', p2);

  const p3 = [
    'Leads weekly Bhakti Vriksha chanting & study groups and manages group member rosters.',
    'Submits daily Field Preaching Entries: Calling Minutes, 1-on-1 sessions, Books distributed, RDUA time, and Planning time.',
    'Prospects and registers new outreach contacts collected during street, university, or corporate programs.'
  ];
  drawCard('3. Bhakti Vriksha (BV) Supervisor', p3);

  const p4 = [
    'Highest administrative tier with complete cross-segment visibility across both PW and FOLK.',
    'Approves pending user registrations, reassigns mentors, and manages account status (Active, Inactive, Rejected).',
    'Broadcasts instant and scheduled Web Push alerts with custom titles and deep links directly to user devices.'
  ];
  drawCard('4. Super Admin & PW Admin', p4);

  // =========================================================================
  // PAGE 3: PHASE 1 ONBOARDING & ACCOUNT STATE MACHINE
  // =========================================================================
  doc.addPage();
  drawRunningHeader('ONBOARDING & ACCOUNT WORKFLOW');
  drawSectionBanner('3', 'Phase 1: Registration, Verification & Approval Lifecycle');

  doc.fillColor(C_TEXT).fontSize(8.6).font('Helvetica').text(
    'Every user undergoes a structured onboarding pipeline to ensure authenticated identity, correct mentor pairing, and proper segment isolation before gaining full platform access.',
    { width: PAGE_WIDTH, lineGap: 2 }
  );
  doc.moveDown(0.4);

  drawCallout(
    '🔒 Account State Machine Workflow',
    'Step 1: Sign-in via Google OAuth or Magic Link\n' +
    'Step 2: Profile Registration Form (Name, Country Code Phone, Ashraya Level, Guide Selection)\n' +
    'Step 3: Account Enters [PENDING_APPROVAL] State (Quarantine Gate)\n' +
    'Step 4: Super Admin / Assigned Guide Reviews Profile & Approves ➔ [ACTIVE]\n' +
    'Step 5: User Unlocks Segment Dashboard & Daily Sadhana Access',
    'info'
  );

  drawSubSectionTitle('Spiritual Examination & Ashraya Levels');

  doc.fillColor(C_TEXT).fontSize(8.5).font('Helvetica').text(
    'During registration, users specify their current spiritual milestone. This allows Mentors and Admins to tailor expectations and counseling to the devotee\'s stage of advancement:',
    { width: PAGE_WIDTH, lineGap: 2 }
  );
  doc.moveDown(0.3);

  const ashrayaHeaders = ['Level', 'Stage Name', 'Significance & Spiritual Standard'];
  const ashrayaRows = [
    ['Level 0', 'Jigyasa (Inquirer)', 'Newcomer exploring Krishna consciousness, beginning basic mantra meditation.'],
    ['Level 1', 'Shraddhavan', 'Developing faith, attending weekly programs, chanting 1–4 rounds daily.'],
    ['Level 2', 'Sevak', 'Committed to regular temple/group seva, chanting 4–8 rounds daily.'],
    ['Level 3', 'Sadhaka', 'Practicing steady sadhana, chanting 16 rounds daily, following 4 regulative principles.'],
    ['Level 4', 'Upasaka', 'Advanced devotee actively assisting in preaching, mentoring, and group facilitation.'],
    ['Level 5', 'Caranashraya', 'Sheltered candidate preparing for formal initiation vows under a Guru.'],
    ['Level 6', 'Harinam Diksha', 'Formally initiated devotee maintaining lifelong vows of 16 rounds and 4 principles.']
  ];
  drawTable(ashrayaHeaders, ashrayaRows, [65, 120, 330]);

  drawSubSectionTitle('Country Code & Global Phone Capture');
  const phoneFeatures = [
    'International Support: Seamless selector for +91 (India), +1 (USA/Canada), +44 (UK), +61 (Australia), +81 (Japan), +49 (Germany), +7 (Russia), and global formats.',
    'Direct WhatsApp / Calling Integration: Allows Guides and Supervisors to initiate 1-click WhatsApp follow-ups directly from the compliance roster.',
    'Unique Device Identity: Ensures each phone and email is linked to a single registered profile to eliminate duplicate accounts.'
  ];
  drawCard('Global Communication Architecture', phoneFeatures);

  // =========================================================================
  // PAGE 4: PHASE 2 DAILY SADHANA FORM & SCORING ENGINE
  // =========================================================================
  doc.addPage();
  drawRunningHeader('DAILY SADHANA FORM & SCORING ENGINE');
  drawSectionBanner('4', 'Phase 2: Daily Sadhana Discipline & Analytics');

  doc.fillColor(C_TEXT).fontSize(8.6).font('Helvetica').text(
    'The Daily Sadhana Form is the operational heart of the application. Spiritual practitioners submit this report daily before sleeping, capturing precise spiritual data points.',
    { width: PAGE_WIDTH, lineGap: 2 }
  );
  doc.moveDown(0.4);

  const sadhanaHeaders = ['Sadhana Parameter', 'Granular Fields Captured', 'Benchmark Standard'];
  const sadhanaRows = [
    ['Wake-up & Rest', 'Exact wake-up time, sleep time, total rest duration', 'Rising before 4:30 AM (Brahma-Muhurta)'],
    ['Chanting (Japa) Slots', 'Rounds before 8AM, before 12PM, before 6PM, after 6PM', '16+ rounds (priority before 12:00 PM)'],
    ['Chanting Focus', 'Self-evaluated quality / attentiveness score (1–10)', 'Mindful, focused, non-distracted japa'],
    ['Book Reading', 'Srila Prabhupada book title, duration (mins), pages read', 'Minimum 30–60 minutes daily reading'],
    ['Hearing / Classes', 'Class duration (mins), Speaker name, Topic / Scripture', 'Hearing lectures, kirtans, or philosophy'],
    ['Seva / Temple Service', 'Specific devotional service performed (cooking, cleaning, etc.)', 'Active daily devotional engagement'],
    ['Cleanliness & Mood', 'Cleanliness score (1–10), Devotional association, Mood notes', 'Personal hygiene and spiritual reflection']
  ];
  drawTable(sadhanaHeaders, sadhanaRows, [110, 245, 160]);

  drawSubSectionTitle('Dynamic Scoring Algorithm & Streak Logic');

  drawCallout(
    '⚡ Instant Sadhana Composite Score Calculation',
    'Upon submission, an automated algorithm evaluates the report and generates an instant score from 0% to 100%:\n' +
    '• Wake-Up Timing (25%): Full points for rising before 4:30 AM; scaled reduction for rising after 6:00 AM.\n' +
    '• Chanting Rounds & Timeliness (40%): 16 rounds completed, weighted higher when completed before noon.\n' +
    '• Book Reading (20%): Full points for ≥ 30 minutes of Srila Prabhupada literature study.\n' +
    '• Hearing & Seva (15%): Evaluated based on lecture duration and active devotional service performed.',
    'success'
  );

  const analyticsFeatures = [
    'Historical Submission Calendar: Interactive heatmaps and daily logs allowing users to review past submissions.',
    'Unbroken Daily Streak: Gamified streak counter that motivates devotees to maintain continuous daily reporting.',
    'Compliance Trends: Visual charts showing 7-day, 30-day, and 90-day consistency in rising times and chanting completion.',
    'Retrospective Editing Safeguards: Allows editing for recent dates while enforcing audit trails for mentor review.'
  ];
  drawCard('Personal Analytics & Streak Tracking', analyticsFeatures);

  // =========================================================================
  // PAGE 5: PHASE 3 MENTORSHIP & GUIDE DASHBOARD
  // =========================================================================
  doc.addPage();
  drawRunningHeader('MENTORSHIP GOVERNANCE & SCORECARDS');
  drawSectionBanner('5', 'Phase 3: Mentorship Oversight & Devotee Scorecards');

  doc.fillColor(C_TEXT).fontSize(8.6).font('Helvetica').text(
    'The Guide / Sadhana Mentor Dashboard is engineered to give mentors immediate, 360-degree clarity on the spiritual health of their assigned devotees without manual tracking overhead.',
    { width: PAGE_WIDTH, lineGap: 2 }
  );
  doc.moveDown(0.4);

  const guideWorkflows = [
    'Daily Compliance Roster: Live categorized roster showing "Submitted Today" (green), "Pending Submission" (amber), and "Inactive / Missing" (red). Mentors can filter by date to inspect compliance.',
    'Devotee Scorecard Drilldown: Clicking any devotee opens their comprehensive spiritual dossier: wake-up timing graphs, chanting slot distribution, book reading consistency, and average sadhana score.',
    'Confidential 1-on-1 Counseling Logs: Mentors record private counseling notes, spiritual hurdles discussed, commitments made, and follow-up target dates.',
    'Mentee Transfer Workflows: Seamlessly handles devotee relocation when transferring between residencies or guides, requiring confirmation from both parties.',
    'Group Online Meetings: Guides can create Zoom or Google Meet sessions with automatic 15-minute push reminders sent to all invited mentees.'
  ];
  drawCard('Core Guide & Mentor Capabilities', guideWorkflows);

  drawSubSectionTitle('Mentorship Review Cycle (A Day in the Life of a Guide)');

  drawCallout(
    '📋 Daily Mentorship Operating Rhythm',
    '1. 08:00 AM (Morning Check): Mentor inspects morning wake-up and japa completion across the cohort.\n' +
    '2. 09:30 PM (Night Review): Mentor checks the pending submission list. Devotees who have not yet submitted receive a quick reminder.\n' +
    '3. Weekly 1-on-1 Counseling: Mentor reviews the 7-day scorecard with the devotee during their scheduled 1-on-1 call, praising consistency and troubleshooting spiritual obstacles.\n' +
    '4. Monthly Review: Mentor reports cohort progress and advancement recommendations to the Supervisor.',
    'primary'
  );

  // =========================================================================
  // PAGE 6: PHASE 4 SUPERVISOR PREACHING CRM & BHAKTI VRIKSHA
  // =========================================================================
  doc.addPage();
  drawRunningHeader('SUPERVISOR PREACHING CRM & BHAKTI VRIKSHA');
  drawSectionBanner('6', 'Phase 4: Supervisor Preaching CRM & Bhakti Vriksha (BV)');

  doc.fillColor(C_TEXT).fontSize(8.6).font('Helvetica').text(
    'Supervisors (Bhakti Vriksha Supervisors) are the frontline preaching leaders. The application provides them with a dedicated Preaching CRM to track personal field outreach and manage weekly reading groups.',
    { width: PAGE_WIDTH, lineGap: 2 }
  );
  doc.moveDown(0.4);

  const preachingHeaders = ['Preaching Parameter', 'Field Measurement', 'Operational Purpose'];
  const preachingRows = [
    ['Calling Time', 'Minutes spent on outreach / follow-up calls', 'Nurturing new devotees and inviting guests to meetings'],
    ['1-on-1 Sessions', 'Minutes & Count of 1:1 preaching meetings', 'Personal counseling, answering doubts, deep philosophy'],
    ['Book Distribution', 'Minutes & Number of Srila Prabhupada books given', 'Distributing Bhagavad-gita, Bhagavatam, small books'],
    ['RDUA Study Time', 'Minutes in Reading, Discussion, Understanding, Application', 'Self-study & preparing discussion topics for BV meetings'],
    ['Planning Time', 'Minutes spent in weekly preaching strategy', 'Organizing venues, scheduling calls, allocating seva'],
    ['Contacts Collected', 'Number of new prospective contacts gathered', 'Street outreach, book table contacts, campus programs']
  ];
  drawTable(preachingHeaders, preachingRows, [115, 175, 225]);

  drawSubSectionTitle('Bhakti Vriksha (BV) Group Management Workflow');

  const bvGroupOps = [
    'Group Creation: Supervisors establish BV Groups with defined group names, meeting times, and meeting links/venues.',
    'Member Enrollment: Devotees join via 1-click invite link or group selection during registration.',
    'Weekly Attendance Tracking: Supervisors log attendance for every weekly session, marking present, absent, or excused.',
    'Member Spiritual Progression: Tracking members as they advance from inquirers (Jigyasa) to chanting devotees (Sadhaka).',
    'Macro Preaching Analytics: Cross-group analytics for Supervisors and RGFs showing total calling hours, total books distributed, and top outreach contributors.'
  ];
  drawCard('Bhakti Vriksha Group Operations', bvGroupOps);

  drawCallout(
    '🎯 What is RDUA?',
    'RDUA is the standard Bhakti Vriksha preaching methodology:\n' +
    '• Reading (R): Reading verses and purports from Srila Prabhupada\'s books together.\n' +
    '• Discussion (D): Interactive exploration of philosophical questions.\n' +
    '• Understanding (U): Clearing doubts and establishing philosophical clarity.\n' +
    '• Application (A): Translating spiritual wisdom into daily life, work, and relationships.',
    'warning'
  );

  // =========================================================================
  // PAGE 7: PHASE 5 & 6 NOTIFICATIONS, SEVA & SUPER ADMIN
  // =========================================================================
  doc.addPage();
  drawRunningHeader('NOTIFICATIONS, SEVA & SUPER ADMIN COMMAND');
  drawSectionBanner('7', 'Phase 5 & 6: Push Notifications, Seva & Admin Console');

  drawSubSectionTitle('Phase 5: Multi-Channel Real-Time Push Notification Engine');

  const notifDetails = [
    'Dual-Channel Delivery Pipeline: Combines W3C Web Push (ECDSA / AES-128-GCM / VAPID) for OS-level background delivery with a Server-Sent Long-Polling Stream (/api/push-events) for instantaneous foreground in-app toasts.',
    'Automated Nightly & Morning Reminder Schedule:\n' +
    '  • Night Round 1 (9:20 PM IST): Initial friendly reminder to fill the sadhana report.\n' +
    '  • Night Round 2 (10:20 PM IST): Follow-up alert for devotees about to sleep.\n' +
    '  • Morning Final Grace (7:40 AM IST): Last chance alert before the submission cutoff.',
    'Super Admin Broadcast Console: Allows Super Admins to send instant custom alerts with custom titles and direct deeplinks, targeted by segment (PW vs FOLK).',
    'Meeting Push Alerts: Auto-dispatches push alerts to invited mentees 15 minutes before scheduled meetings.'
  ];
  drawCard('Notification & Alerting System', notifDetails);

  drawSubSectionTitle('Phase 6: Facility Cleanliness & Temple Service Rosters');

  const sevaDetails = [
    'Cleanliness Auditing: Daily cleanliness rating and inspection logs for residency rooms, temple halls, and common spaces.',
    'Service / Seva Allocations: Assigning daily temple duties (Deity worship, kitchen seva, book stall, garland making, cleaning).',
    'Compliance Tracking: Ensures all residency residents actively participate in devotional service alongside their daily study.'
  ];
  drawCard('Cleanliness & Facility Seva Management', sevaDetails);

  drawSubSectionTitle('Super Admin Command & Governance');
  const adminDetails = [
    'User Management Console: Master database view to approve, activate, deactivate, or reassign any user or mentor.',
    'Segment Override: Capability to switch users between Prabhupada World (PW) and FOLK tracks.',
    'Super BV Preaching Analytics: Consolidated reporting across all Supervisors, Guides, and Residencies.'
  ];
  drawCard('Master Administrative Controls', adminDetails);

  // =========================================================================
  // PAGE 8: TECHNICAL ARCHITECTURE & SUMMARY CHEAT SHEET
  // =========================================================================
  doc.addPage();
  drawRunningHeader('TECHNICAL STACK & QUICK SUMMARY');
  drawSectionBanner('8', 'Technical Architecture & Beginner Summary');

  drawSubSectionTitle('Enterprise Cloud Technology Stack');

  const techRows = [
    ['Frontend Framework', 'Next.js 16 (App Router + SPA Hybrid Mode)', 'Blazing fast load times, client routing, modern React 18 UI'],
    ['Styling & Animations', 'Tailwind CSS, Framer Motion, Lucide Icons', 'Responsive mobile-first design with smooth micro-interactions'],
    ['Database Layer', 'Google Cloud Firestore (Multi-region NoSQL)', 'Real-time synchronization with automatic offline cache fallback'],
    ['Authentication', 'Firebase Auth + JWT Session Validation', 'Secure Google OAuth, Magic Links, and role claims verification'],
    ['Push & Real-Time', 'Web Crypto VAPID + Server-Sent Long Polling', 'Zero-dependency pure Web Crypto push notification engine'],
    ['Cloud Deployment', 'Firebase App Hosting on Google Cloud Run', 'Containerized autoscaling infrastructure with multi-zone redundancy']
  ];
  drawTable(['Component', 'Technology Utilized', 'Operational Benefit'], techRows, [110, 185, 220]);

  drawSubSectionTitle('Quick Explainer for a Stranger (Cheat Sheet)');

  drawCallout(
    '💡 Explaining the App in Simple Terms',
    '"Imagine a fitness app like Strava or Fitbit, but built for your spiritual life, meditation, and devotional service. Every day, devotees log their chanting meditation, sacred book reading, and wake-up times. Their assigned Mentors look at their scorecards to encourage and guide them. Meanwhile, outreach Supervisors track their preaching calls, book distribution, and weekly study groups. It brings discipline, accountability, and loving community care to spiritual growth."',
    'primary'
  );

  doc.moveDown(0.3);

  // Footer Stamp
  if (doc.y > 750) doc.addPage();
  doc.save();
  doc.roundedRect(LEFT_X, doc.y, PAGE_WIDTH, 26, 4).fill(C_HEADER_BG);
  doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold')
     .text('© 2026 Srila Prabhupada World Academy • All Rights Reserved', LEFT_X, doc.y + 8, { align: 'center', width: PAGE_WIDTH });
  doc.restore();

  // Page Numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.save();
    
    // Temporarily remove bottom margin to prevent auto page-breaks when rendering footer
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    
    doc.fillColor(C_MUTED).fontSize(7.5).font('Helvetica')
       .text(`Page ${i + 1} of ${range.count}`, LEFT_X, 810, { align: 'right', width: PAGE_WIDTH, lineBreak: false });
    doc.text('Prabhupada World Academy — Complete System Specification Guide', LEFT_X, 810, { align: 'left', width: 350, lineBreak: false });
    
    doc.page.margins.bottom = oldBottom;
    doc.restore();
  }

  doc.end();

  stream.on('finish', () => {
    try {
      fs.copyFileSync(outputPath, rootPath);
      fs.copyFileSync(outputPath, brainPath);
    } catch {}
    console.log('High-Detail PDF Generated successfully at:', outputPath);
  });
}

buildDetailedPdf();
