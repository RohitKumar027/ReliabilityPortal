// app.js — extracted inline scripts

// --- Helpers for matching & hours ---
function normalizeName(s) {
  if (!s) return "";
  const base = String(s).trim().toLowerCase();
  const cut = base.indexOf(" (");
  return (cut >= 0 ? base.slice(0, cut) : base);
}
function namesFromTest(test) {
  const raw = (test && (test.technician || test.assignedTechnician || test.assignee)) || "";
  return String(raw)
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(normalizeName);
}
function getRemainingManHoursSafe(test) {
  try {
    if (typeof getRemainingManHours === "function") return Math.max(0, getRemainingManHours(test));
  } catch (e) {}
  if (typeof test?.remainingManHours === "number") return Math.max(0, test.remainingManHours);
  if (typeof test?.manHours === "number") return Math.max(0, test.manHours);
  if (typeof test?.estimatedHoursRemaining === "number") return Math.max(0, test.estimatedHoursRemaining);
  return 0;
}
// === Power consumption helpers ===
function calculateTotalPowerConsumptionKW() {
    try {
      let total = 0;
      const active = labData.activeTests || [];
      const configsByName = {};
  
      // Build a quick lookup of test configs
      Object.values(labData.testConfigs || {}).forEach(arr => {
        (arr || []).forEach(cfg => { 
          if (cfg?.name) configsByName[cfg.name] = cfg; 
        });
      });
  
      active.forEach(t => {
        const cfg = configsByName[t.test];
        if (cfg && typeof cfg.power === 'number') {
          total += cfg.power;
        } else if (typeof t.power === 'number') {
          total += t.power;
        }
      });
  
      return total; // kW
    } catch (e) {
      console.error('Power calculation error:', e);
      return 0;
    }
  }
  
  function buildPowerDetail() {
    const names = (labData.activeTests || []).map(t => t.test).filter(Boolean);
    if (names.length === 0) return 'No active tests';
    const head = names.slice(0, 3).join(', ');
    return names.length > 3 ? `${head} +${names.length - 3} more` : head;
  }
  
// === Render per-tech details live ===
function renderManUtilizationDetails() {
  const container = document.getElementById("manDetailsContentV2");
  if (!container) return;

  const techs = (typeof getAvailableTechniciansInShift === "function")
    ? getAvailableTechniciansInShift()
    : (labData.technicians || []);

  const tests = labData.activeTests || [];
  
  // Get all technicians in the current shift
  const currentShifts = getCurrentShift();
  const techniciansInShift = techs.filter(tech => 
    currentShifts.includes(tech.shift) || 
    (tech.shift && tech.shift.startsWith('shift') && currentShifts.includes(tech.shift.replace('shift', '')))
  );

  let html = '<div class="machine-queues-container">';
  
  if (techniciansInShift.length > 0) {
    techniciansInShift.forEach(tech => {
      // Calculate utilization for this technician
      const techNameKey = normalizeName(tech.name || "");
      const shiftRemainingTime = getShiftRemainingTime(tech.shift);
      let workload = 0;
      let assignedTests = [];

      // Calculate workload from active tests
      tests.forEach(test => {
        const list = namesFromTest(test);
        if (list.includes(normalizeName(tech.name))) {
          const remaining = getRemainingManHoursSafe(test);
          let displayId = test.sampleId || 
                         test.modelName || 
                         `T-${String(test.requestId).slice(-4)}`;
          
          assignedTests.push({
            id: displayId,
            remaining: remaining,
            requestId: test.requestId
          });
          workload += remaining;
        }
      });
      
      console.log('  Total assigned tests for', tech.name + ':', assignedTests.length);

      // Calculate utilization percentage
      const utilization = shiftRemainingTime > 0 ? Math.min(100, (workload / shiftRemainingTime) * 100) : 0;

      // Create test list with better formatting
      let testList = '<div class="test-assignments">';
      if (assignedTests.length > 0) {
        assignedTests.forEach(test => {
          testList += `
            <div class="test-assignment">
              <span class="test-id">${test.id}</span>
              <span class="test-hours">${test.remaining.toFixed(1)}h</span>
            </div>`;
        });
      } else {
        testList += '<div class="no-assignments">No active assignments</div>';
      }
      testList += '</div>';

      // Add some CSS for better test display
      const testStyles = `
        <style>
          .test-assignments {
            margin-top: 8px;
            max-height: 150px;
            overflow-y: auto;
            padding-right: 5px;
          }
          .test-assignment {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            border-bottom: 1px solid #eee;
            font-size: 0.85em;
          }
          .test-assignment:last-child {
            border-bottom: none;
          }
          .test-id {
            font-weight: 500;
            color: #333;
          }
          .test-hours {
            color: #666;
            font-family: monospace;
          }
          .no-assignments {
            color: #999;
            font-style: italic;
            text-align: center;
            padding: 5px 0;
          }
        </style>
      `;

      html += `
        <div class="metric-card">
          <div class="metric-label">${tech.name} ${tech.id ? `(${tech.id})` : ''}</div>
          <div class="metric-value">${utilization.toFixed(0)}%</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${utilization}%"></div>
          </div>
          <div class="metric-sublabel">${workload.toFixed(1)}/${shiftRemainingTime.toFixed(1)} hours</div>
          ${testStyles}
          <div class="metric-detail">
            ${testList}
          </div>
        </div>`;
    });
  } else {
    html += '<p>No technicians available or assigned to current shift</p>';
  }

  html += '</div>';
  container.innerHTML = html;
}

// ----

// Make docx available globally
        window.docx = window.docx || {};

// ----

// Data structures
var labData = {
            productCategories: ["geyser", "ict", "inverter", "stabilizer", "Air Cooler", "Water Heater", "Kitchen Chimney", "Mixer Grinder", "Modular Switches"],
            machines: [],
            technicians: [],
            testConfigs: {},
            activeTests: [],
            testQueue: [],
            completedTests: [],
            failedTests: [],
            selectedMachinesForConfig: [],
            machineOccupancy: {},
            completedProducts: [],
            failedProducts: [],
            productsWithNC: [], // Track products that passed but have NC
            currentSpecificationSets: [],
            testFiles: {},
            lifecycleProducts: [],
            lifecycleTimers: {},
            lifecycleConfig: {},
            requestDeadlines: {},
            onTimeCompletions: 0,
            totalCompletions: 0,
            skuReports: {},
            skuModelNames: {},
            totalReceivedSKUs: [], // Track unique SKUs received
            ncReportCounter: 0, // Counter for NC report numbers
            testRequestNumbers: {}, // Store fixed test request numbers for SKUs
            reportNumbers: {}, // Store fixed report numbers for SKUs
            shiftSchedule: {
                shiftG: { start: 9, end: 17.5, name: 'General Shift (9AM - 5:30PM)' },
                shiftA: { start: 6, end: 14, name: 'Shift A (6AM - 2PM)' },
                shiftB: { start: 14, end: 22, name: 'Shift B (2PM - 10PM)' },
                shiftC: { start: 22, end: 6, name: 'Shift C (10PM - 6AM)' },

                // keep legacy keys for compatibility
                shift1: { start: 6, end: 14, name: 'Shift 1 (6AM - 2PM)' },
                shift2: { start: 14, end: 22, name: 'Shift 2 (2PM - 10PM)' },
                shift3: { start: 22, end: 6, name: 'Shift 3 (10PM - 6AM)' }
            },
            specSetCounter: 0,
            timelineLastReset: null,
            skuPhotos: {} // Store photos for each SKU
        };
        
        

// === Persistence helpers for Technicians & Machines (like Test Configs) ===
function saveTechnicians() {
    try { localStorage.setItem('technicians', JSON.stringify(labData.technicians)); } catch(e){}
}
function loadTechnicians() {
    try {
        const saved = localStorage.getItem('technicians');
        if (saved) labData.technicians = JSON.parse(saved);
    } catch(e){}
}
function saveMachines() {
    try { localStorage.setItem('machines', JSON.stringify(labData.machines)); } catch(e){}
}
function loadMachines() {
    try {
        const saved = localStorage.getItem('machines');
        if (saved) labData.machines = JSON.parse(saved);
    } catch(e){}
}
// === End persistence helpers ===
// === End persistence helpers ===

// Lead Time Modal Functions
function showLeadTimeDetails() {
    try {
        const modal = document.getElementById('leadTimeModal');
        const content = document.getElementById('leadTimeDetailsContent');
        
        if (!modal || !content) return;

        // Get all active tests
        const activeTests = labData.activeTests || [];
        const activeProducts = {};

        // Group tests by product
        activeTests.forEach(test => {
            if (!test.productId) test.productId = 'unknown';
            
            if (!activeProducts[test.productId]) {
                activeProducts[test.productId] = {
                    productName: test.productName || `Product ${test.productId}`,
                    tests: [],
                    totalLeadTime: 0
                };
            }
            
            const leadTime = getRemainingTestHours(test) || 0;
            activeProducts[test.productId].tests.push({
                testName: test.test || 'Unnamed Test',
                leadTime: leadTime,
                status: test.status || 'In Progress'
            });
            activeProducts[test.productId].totalLeadTime += leadTime;
        });

        // Generate HTML for the modal
        let html = '';
        
        Object.values(activeProducts).forEach(product => {
            if (product.tests.length === 0) return;
            
            html += `
                <div class="lead-time-item">
                    <div class="lead-time-header">
                        <span class="lead-time-product">${product.productName}</span>
                        <span class="lead-time-value">${formatTimeInDHM(product.totalLeadTime)}</span>
                    </div>
                    <div class="lead-time-details">
                        ${product.tests.map(test => `
                            <div class="lead-time-detail">
                                <div class="lead-time-detail-label">${test.testName}</div>
                                <div class="lead-time-detail-value">
                                    ${formatTimeInDHM(test.leadTime)}
                                    <span style="color: ${test.status === 'Completed' ? '#4caf50' : '#ffd700'}">
                                        (${test.status})
                                    </span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        if (Object.keys(activeProducts).length === 0) {
            html = '<p>No active processes found.</p>';
        }

        content.innerHTML = html;
        modal.style.display = 'flex';
    } catch (error) {
        console.error('Error showing lead time details:', error);
    }
}

function closeLeadTimeModal() {
    const modal = document.getElementById('leadTimeModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function formatTimeInDHM(hours) {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.floor(hours % 24);
    const minutes = Math.floor((hours - Math.floor(hours)) * 60);
    
    let result = [];
    if (days > 0) result.push(`${days}d`);
    if (remainingHours > 0 || days > 0) result.push(`${remainingHours}h`);
    if (minutes > 0 || result.length === 0) result.push(`${minutes}m`);
    
    return result.join(' ');
}

let currentRequest = null;
let pendingSKUNames = false;
        
        // Calculate total SKUs received (not samples)
        function calculateTotalReceivedSKUs() {
            try {
                const uniqueSKUs = new Set();
                
                // Only count actual SKUs that were properly added to the system
                labData.testQueue.forEach(request => {
                    if (request.skuNames) {
                        Object.keys(request.skuNames).forEach(skuNum => {
                            const skuId = `${request.productClass}-${request.productType}-${request.skuNames[skuNum]}-${request.id}`;
                            uniqueSKUs.add(skuId);
                        });
                    }
                });
                
                return uniqueSKUs.size;
            } catch (error) {
                console.error('Total SKUs calculation error:', error);
                return 0;
            }
        }
        
        // Calculate NC count (products failed + products passed with NC)
        // Replace your existing calculateNCCount() with this
// Replace your existing calculateNCCount() with this
function calculateNCCount() {
    try {
      const skuWithIssue = new Set();
  
      // 1) Finished SKUs you already track
      (labData.failedProducts || []).forEach(p => skuWithIssue.add(p.productId));
      (labData.productsWithNC || []).forEach(p => skuWithIssue.add(p.productId));
  
// 2) In-progress SKUs (look into saved testResults)
(labData.testQueue || []).forEach(req => {
    (req.samples || []).forEach(sample => {
      const skuKey = `${req.productClass}-${req.productType}-${sample.modelName}-${req.id}`;
  
      const tests = (sample.tests || Object.keys(sample.testResults || {}));
      tests.forEach(testName => {
        const tr = sample.testResults?.[testName];
        if (!tr) return;
        if (tr.result === 'fail' || tr.hasNcObservation === true || tr.hasNcObservation === 'yes') {
          skuWithIssue.add(skuKey);
        }
      });
    });
  });
      return skuWithIssue.size;
    } catch (e) {
      console.error('NC count calculation error:', e);
      return 0;
    }
  }
        // Calculate on-time percentage
function calculateOnTimePercentage() {
    try {
        if (labData.totalCompletions === 0) {
            return null; // No completions yet, show 100%
        }
        
        const percentage = (labData.onTimeCompletions / labData.totalCompletions) * 100;
        return Math.round(percentage);
    } catch (error) {
        console.error('On-time percentage calculation error:', error);
        return null;
    }
}
        





        // Get NC breakdown (failed vs passed with NC)
// Replace your existing getNCBreakdown() with this
// Replace your existing getNCBreakdown() with this
function getNCBreakdown() {
    const breakdown = {
      failed: { total: 0, NP: 0, RP: 0, ECN: 0 },
      passedWithNC: { total: 0, NP: 0, RP: 0, ECN: 0 }
    };
  
    const failedSet = new Set();
    const passedNcSet = new Set();
  
    // 1) Finished SKUs
    (labData.failedProducts || []).forEach(p => {
      if (!failedSet.has(p.productId)) {
        failedSet.add(p.productId);
        if (p.productClass && breakdown.failed[p.productClass] !== undefined) {
          breakdown.failed[p.productClass]++;
        }
      }
    });
  
    (labData.productsWithNC || []).forEach(p => {
      if (!failedSet.has(p.productId) && !passedNcSet.has(p.productId)) {
        passedNcSet.add(p.productId);
        if (p.productClass && breakdown.passedWithNC[p.productClass] !== undefined) {
          breakdown.passedWithNC[p.productClass]++;
        }
      }
    });
  
// 2) In-progress SKUs (scan testResults)
(labData.testQueue || []).forEach(req => {
    (req.samples || []).forEach(sample => {
      const skuKey = `${req.productClass}-${req.productType}-${sample.modelName}-${req.id}`;
      let sawFail = false;
      let sawObs = false;
  
      const tests = (sample.tests || Object.keys(sample.testResults || {}));
      tests.forEach(testName => {
        const tr = sample.testResults?.[testName];
        if (!tr) return;
        if (tr.result === 'fail') sawFail = true;
        if (tr.hasNcObservation === true || tr.hasNcObservation === 'yes') sawObs = true;
      });
  
      if (sawFail && !failedSet.has(skuKey)) {
        failedSet.add(skuKey);
        if (req.productClass && breakdown.failed[req.productClass] !== undefined) breakdown.failed[req.productClass]++;
      } else if (!sawFail && sawObs && !passedNcSet.has(skuKey)) {
        passedNcSet.add(skuKey);
        if (req.productClass && breakdown.passedWithNC[req.productClass] !== undefined) breakdown.passedWithNC[req.productClass]++;
      }
    });
  });
  
    breakdown.failed.total = failedSet.size;
    breakdown.passedWithNC.total = passedNcSet.size;
    return breakdown;
  }
  
  
        
        // Get Julian date
        function getJulianDate() {
            const now = new Date();
            const start = new Date(now.getFullYear(), 0, 0);
            const diff = now - start;
            const oneDay = 1000 * 60 * 60 * 24;
            const day = Math.floor(diff / oneDay);
            return String(day).padStart(3, '0') + String(now.getFullYear()).slice(-2);
        }
        
        // Generate test request number - FIXED to be consistent
        function generateTestRequestNumber(productType, modelName, skuId) {
            // Check if we already have a test request number for this SKU
            if (labData.testRequestNumbers[skuId]) {
                return labData.testRequestNumbers[skuId];
            }
            
            const julianDate = getJulianDate();
            const cleanModelName = modelName.replace(/[^a-zA-Z0-9]/g, '');
            const requestNumber = `TR-KLB/${productType.toUpperCase()}/${cleanModelName}/${julianDate}/${Date.now().toString().slice(-3)}`;
            
            // Store it for future use
            labData.testRequestNumbers[skuId] = requestNumber;
            
            return requestNumber;
        }
        
        // Generate report number - FIXED to be consistent
        function generateReportNumber(productClass, modelName, skuId) {
            // Check if we already have a report number for this SKU
            if (labData.reportNumbers[skuId]) {
                return labData.reportNumbers[skuId];
            }
            
            const reportNo = `REL/KLB/${productClass}/${modelName.replace(/\s+/g, '').toUpperCase()}/${new Date().getFullYear()}/${Date.now().toString().slice(-3)}`;
            
            // Store it for future use
            labData.reportNumbers[skuId] = reportNo;
            
            return reportNo;
        }
        // FEATURE 1: Generate Word Report for completed SKU - FIXED with enhanced tables and procedures
        async function generateWordReport(skuId, request, samples) {
            try {
                // Check if docx is available
                if (typeof window.docx === 'undefined') {
                    showAlert('Document generation library is loading, please try again in a moment', 'warning');
                    return;
                }
                
                const { Document, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, 
                    BorderStyle, WidthType, HeadingLevel, PageBreak, ImageRun } = window.docx;
                    function dataUrlToUint8Array(dataUrl) {
                        const base64 = (dataUrl || '').split(',')[1] || '';
                        const bin = atob(base64);
                        const len = bin.length;
                        const bytes = new Uint8Array(len);
                        for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
                        return bytes;
                      }
                                  
                
                // Get SKU specific data
                const skuSamples = samples.filter(s => getSKUId(s.id) === skuId);
                if (skuSamples.length === 0) return;
                
                const firstSample = skuSamples[0];
                const modelName = firstSample.modelName || skuId;
                
                // Calculate test duration
                const startDate = new Date(request.submittedAt);
                const endDate = new Date();
                const duration = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
                
                // Get or generate report number
                const reportNo = generateReportNumber(request.productClass, modelName, skuId);
                
                // Generate sample serial number
                const sampleSerial = `KLB/${modelName.replace(/\s+/g, '').toUpperCase()}/NP/C-${new Date().getFullYear().toString().slice(-2)}/${Date.now().toString().slice(-3)}`;
                
                // Generate test request number
                const testRequestNo = generateTestRequestNumber(request.productType, modelName, skuId);
                
                // Collect all test names
                const allTestNames = [];
                skuSamples.forEach(sample => {
                    sample.tests.forEach(testName => {
                        if (!allTestNames.includes(testName.toUpperCase())) {
                            allTestNames.push(testName.toUpperCase());
                        }
                    });
                });
                
                // Prepare test details arrays
                const testDetailsList = [];
                const testProcedureDetails = [];
                let testIndex = 1;
                
                // Collect technicians who checked the tests
                const checkedByTechnicians = new Set();
                
                // Collect all test photos for the photos page
                const allTestPhotos = [];
                
                skuSamples.forEach(sample => {
                    sample.tests.forEach((testName, idx) => {
                        const result = sample.testResults[testName];
                        const testConfig = sample.testConfigs[idx];
                        
                        // Collect technician info
                        if (result && result.technician) {
                            checkedByTechnicians.add(result.technician);
                        }
                        
                        // Collect photos for this test
                        const testKey = `${sample.id}-${testName}`;
                        if (sample.testFiles && sample.testFiles[testKey]) {
                            allTestPhotos.push({
                                testName: testName,
                                sampleId: sample.id,
                                before: sample.testFiles[testKey].before,
                                after: sample.testFiles[testKey].after
                            });
                        }
                        
                        if (result && !testDetailsList.find(t => t.name === testName)) {
                            testDetailsList.push({
                                index: testIndex++,
                                name: testName,
                                referenceDoc: `SOP/REL/${request.productType}/${String(testIndex).padStart(2, '0')}`,
                                remarks: `Tested ${skuSamples.length.toString().padStart(2, '0')} sample${skuSamples.length > 1 ? 's' : ''}`
                            });
                            
                            testProcedureDetails.push({
                                index: testDetailsList.length,
                                name: testName,
                                procedure: testConfig?.procedure || '', // Show procedure if available, otherwise blank
                                specification: testConfig?.selectedSpecSet?.parameters || [],
                                observations: result.result === 'fail' || result.ncType ? result.remarks : 'No failure reported',
                                remarks: result.result === 'fail' ? '--' : 'Pass'
                            });
                        }
                    });
                });

                // Format checked by list
                const checkedByList = Array.from(checkedByTechnicians).join(', ') || 'Lab Technician';

                // Create document with actual page breaks and larger tables
                const doc = new Document({
                    sections: [
                        {
                            properties: {
                                page: {
                                    margin: {
                                        top: 720,  // 0.5 inch
                                        right: 720,
                                        bottom: 720,
                                        left: 720
                                    }
                                }
                            },
                            children: [
                                // Title
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: "V-GUARD INDUSTRIES LTD",
                                            bold: true,
                                            size: 32
                                        })
                                    ],
                                    alignment: AlignmentType.CENTER
                                }),
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: "Lab Test Report",
                                            bold: true,
                                            size: 28
                                        })
                                    ],
                                    alignment: AlignmentType.CENTER
                                }),
                                
                                new Paragraph({ text: "" }),
                                
                                // Main details table with full width
                                new Table({
                                    width: { size: 100, type: WidthType.PERCENTAGE },
                                    columnWidths: [33, 33, 34], // Equal column widths
                                    rows: [
                                        new TableRow({
                                            children: [
                                                new TableCell({ 
                                                    children: [new Paragraph("NAME & ADDRESS")],
                                                    width: { size: 33, type: WidthType.PERCENTAGE }
                                                }),
                                                new TableCell({ 
                                                    children: [new Paragraph("REPORT NO.")],
                                                    width: { size: 33, type: WidthType.PERCENTAGE }
                                                }),
                                                new TableCell({ 
                                                    children: [new Paragraph(reportNo)],
                                                    width: { size: 34, type: WidthType.PERCENTAGE }
                                                })
                                            ]
                                        }),
                                        new TableRow({
                                            children: [
                                                new TableCell({ children: [new Paragraph("TEST ITEM DETAILS")] }),
                                                new TableCell({ 
                                                    children: [new Paragraph(modelName.toUpperCase())],
                                                    columnSpan: 2
                                                })
                                            ]
                                        }),
                                        new TableRow({
                                            children: [
                                                new TableCell({ children: [new Paragraph("SAMPLE QTY")] }),
                                                new TableCell({ 
                                                    children: [new Paragraph(`${skuSamples.length.toString().padStart(2, '0')} NO.`)],
                                                    columnSpan: 2
                                                })
                                            ]
                                        }),
                                        new TableRow({
                                            children: [
                                                new TableCell({ children: [new Paragraph("V-GUARD RELIABILITY LAB")] }),
                                                new TableCell({ children: [new Paragraph("DATE OF SAMPLE RECEIPT")] }),
                                                new TableCell({ children: [new Paragraph("")] })
                                            ]
                                        }),
                                        new TableRow({
                                            children: [
                                                new TableCell({ children: [new Paragraph("")] }),
                                                new TableCell({ children: [new Paragraph("TEST START DATE")] }),
                                                new TableCell({ children: [new Paragraph(formatDate(startDate))] })
                                            ]
                                        }),
                                        new TableRow({
                                            children: [
                                                new TableCell({ children: [new Paragraph("")] }),
                                                new TableCell({ children: [new Paragraph("TEST END DATE")] }),
                                                new TableCell({ children: [new Paragraph(formatDate(endDate))] })
                                            ]
                                        }),
                                        new TableRow({
                                            children: [
                                                new TableCell({ children: [new Paragraph("SAMPLE RECEIVED FROM")] }),
                                                new TableCell({ 
                                                    children: [new Paragraph("")],
                                                    columnSpan: 2
                                                })
                                            ]
                                        }),
                                        new TableRow({
                                            children: [
                                                new TableCell({ children: [new Paragraph("TEST LOCATION")] }),
                                                new TableCell({ 
                                                    children: [new Paragraph("KALA AMB -- RELIABILITY LAB")],
                                                    columnSpan: 2
                                                })
                                            ]
                                        }),
                                        new TableRow({
                                            children: [
                                                new TableCell({ children: [new Paragraph("SAMPLE CATEGORY")] }),
                                                new TableCell({ 
                                                    children: [new Paragraph(
                                                        request.productClass === 'NP' ? 'NEW' : 
                                                        request.productClass === 'RP' ? 'RUNNING' : 'ECN'
                                                    )],
                                                    columnSpan: 2
                                                })
                                            ]
                                        }),
                                        new TableRow({
                                            children: [
                                                new TableCell({ children: [new Paragraph("ECN/ PROJECT NO.")] }),
                                                new TableCell({ 
                                                    children: [new Paragraph("NA")],
                                                    columnSpan: 2
                                                })
                                            ]
                                        }),
                                        new TableRow({
                                            children: [
                                                new TableCell({ children: [new Paragraph("TYPE OF TEST CONDUCTED")] }),
                                                new TableCell({ 
                                                    children: [new Paragraph(allTestNames.join(', '))],
                                                    columnSpan: 2
                                                })
                                            ]
                                        }),
                                        new TableRow({
                                            children: [
                                                new TableCell({ children: [new Paragraph("TEST EQUIPMENT DETAILS")] }),
                                                new TableCell({ 
                                                    children: [new Paragraph("")],
                                                    columnSpan: 2
                                                })
                                            ]
                                        }),
                                        new TableRow({
                                            children: [
                                                new TableCell({ children: [new Paragraph("AMBIENT TEMP. & HUMIDITY")] }),
                                                new TableCell({ 
                                                    children: [new Paragraph("")],
                                                    columnSpan: 2
                                                })
                                            ]
                                        }),
                                        new TableRow({
                                            children: [
                                                new TableCell({ children: [new Paragraph("DURATION OF TEST")] }),
                                                new TableCell({ 
                                                    children: [new Paragraph(`${duration} DAYS`)],
                                                    columnSpan: 2
                                                })
                                            ]
                                        }),
                                        new TableRow({
                                            children: [
                                                new TableCell({ children: [new Paragraph("SAMPLE SERIAL NUMBER")] }),
                                                new TableCell({ 
                                                    children: [new Paragraph(sampleSerial)],
                                                    columnSpan: 2
                                                })
                                            ]
                                        }),
                                        new TableRow({
                                            children: [
                                                new TableCell({ children: [new Paragraph("TEST REQUEST NUMBER")] }),
                                                new TableCell({ 
                                                    children: [new Paragraph(testRequestNo)],
                                                    columnSpan: 2
                                                })
                                            ]
                                        })
                                    ]
                                }),
                                
                                new Paragraph({ text: "" }),
                                
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: "SAMPLE IMAGE",
                                            bold: true
                                        })
                                    ]
                                }),
                                
// Try to show the first available photo (before/after) from any test
...( (() => {
    const photos = [];
    const firstSet = allTestPhotos.find(p => (p.before && p.before[0]) || (p.after && p.after[0]));
  
    if (firstSet?.before?.[0]?.data) {
      try {
        photos.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: dataUrlToUint8Array(firstSet.before[0].data),
                transformation: { width: 400, height: 250 }
              })
            ],
            alignment: AlignmentType.CENTER
          })
        );
      } catch {}
    }
  
    if (firstSet?.after?.[0]?.data) {
      try {
        photos.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: dataUrlToUint8Array(firstSet.after[0].data),
                transformation: { width: 400, height: 250 }
              })
            ],
            alignment: AlignmentType.CENTER
          })
        );
      } catch {}
    }
  
    return photos.length ? photos : [
      new Paragraph({
        children:[ new TextRun({ text: `${modelName} - [No photos available]` }) ],
        alignment: AlignmentType.CENTER
      })
    ];
  })() ),
  
                                
                                new Paragraph({ text: "" }),
                                
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: "TEST DETAILS",
                                            bold: true
                                        }),
                                        new TextRun({
                                            text: " - As per sheet 2"
                                        })
                                    ]
                                }),
                                
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: "TEST SPECIFICATION",
                                            bold: true
                                        }),
                                        new TextRun({
                                            text: " - As per Internal Test Plan"
                                        })
                                    ]
                                }),
                                
                                new Paragraph({ text: "" }),
                                
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: "TEST RESULT: ",
                                            bold: true
                                        }),
                                        new TextRun({
                                            text: "" // Left blank for manual input
                                        })
                                    ]
                                }),
                                
                                new Paragraph({ text: "" }),
                                
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: "REMARKS: ",
                                            bold: true
                                        }),
                                        new TextRun({
                                            text: "[To be filled manually]"
                                        })
                                    ]
                                }),
                                
                                new Paragraph({ text: "" }),
                                
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: "CHECKED BY: ",
                                            bold: true
                                        }),
                                        new TextRun(checkedByList)
                                    ]
                                }),
                                
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: "APPROVED BY: ",
                                            bold: true
                                        }),
                                        new TextRun("Mr. Sandeep Kumar (Reliability Lab In-charge, Kala Amb)")
                                    ]
                                })
                            ]
                        },
                        // Second page with test details
                        {
                            properties: {
                                page: {
                                    margin: {
                                        top: 720,
                                        right: 720,
                                        bottom: 720,
                                        left: 720
                                    }
                                }
                            },
                            children: [
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: "Test Details:",
                                            bold: true,
                                            size: 28
                                        })
                                    ]
                                }),
                                
                                new Paragraph({ text: "" }),
                                
                                // Test Details Table with full width
                                new Table({
                                    width: { size: 100, type: WidthType.PERCENTAGE },
                                    columnWidths: [10, 30, 40, 20],
                                    rows: [
                                        new TableRow({
                                            children: [
                                                new TableCell({ 
                                                    children: [new Paragraph("Sr. No.")],
                                                    width: { size: 10, type: WidthType.PERCENTAGE }
                                                }),
                                                new TableCell({ 
                                                    children: [new Paragraph("Test Details")],
                                                    width: { size: 30, type: WidthType.PERCENTAGE }
                                                }),
                                                new TableCell({ 
                                                    children: [new Paragraph("Internal Reference Document No.")],
                                                    width: { size: 40, type: WidthType.PERCENTAGE }
                                                }),
                                                new TableCell({ 
                                                    children: [new Paragraph("Remarks")],
                                                    width: { size: 20, type: WidthType.PERCENTAGE }
                                                })
                                            ]
                                        }),
                                        ...testDetailsList.map(test => 
                                            new TableRow({
                                                children: [
                                                    new TableCell({ children: [new Paragraph(test.index.toString())] }),
                                                    new TableCell({ children: [new Paragraph(test.name)] }),
                                                    new TableCell({ children: [new Paragraph(test.referenceDoc)] }),
                                                    new TableCell({ children: [new Paragraph(test.remarks)] })
                                                ]
                                            })
                                        )
                                    ]
                                }),
                                
                                new Paragraph({ text: "" }),
                                new Paragraph({ text: "" }),
                                
                                // Test Procedure Details Table with full width
                                new Table({
                                    width: { size: 100, type: WidthType.PERCENTAGE },
                                    columnWidths: [8, 22, 30, 25, 15],
                                    rows: [
                                        new TableRow({
                                            children: [
                                                new TableCell({ 
                                                    children: [new Paragraph("Sr. No.")],
                                                    width: { size: 8, type: WidthType.PERCENTAGE }
                                                }),
                                                new TableCell({ 
                                                    children: [new Paragraph("Test Details")],
                                                    width: { size: 22, type: WidthType.PERCENTAGE }
                                                }),
                                                new TableCell({ 
                                                    children: [new Paragraph("Test procedure")],
                                                    width: { size: 30, type: WidthType.PERCENTAGE }
                                                }),
                                                new TableCell({ 
                                                    children: [new Paragraph("Observations")],
                                                    width: { size: 25, type: WidthType.PERCENTAGE }
                                                }),
                                                new TableCell({ 
                                                    children: [new Paragraph("Remarks")],
                                                    width: { size: 15, type: WidthType.PERCENTAGE }
                                                })
                                            ]
                                        }),
                                        ...testProcedureDetails.map(test => 
                                            new TableRow({
                                                children: [
                                                    new TableCell({ children: [new Paragraph(test.index.toString())] }),
                                                    new TableCell({ children: [new Paragraph(test.name)] }),
                                                    new TableCell({ 
                                                        children: [new Paragraph(test.procedure)] // Show procedure, not spec
                                                    }),
                                                    new TableCell({ children: [new Paragraph(test.observations)] }),
                                                    new TableCell({ children: [new Paragraph(test.remarks)] })
                                                ]
                                            })
                                        )
                                    ]
                                })
                            ]
                        },
                        // Third page with photos
                        {
                            properties: {
                                page: {
                                    margin: {
                                        top: 720,
                                        right: 720,
                                        bottom: 720,
                                        left: 720
                                    }
                                }
                            },
                            children: [
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: "TESTED SAMPLES PHOTOS",
                                            bold: true,
                                            size: 24
                                        })
                                    ]
                                }),
                                
                                new Paragraph({ text: "" }),
                                
                                // Add photos for each test
// Add photos for each test (with images)
...allTestPhotos.flatMap(photoSet => {
    const blocks = [
      new Paragraph({
        children: [ new TextRun({ text: `Test: ${photoSet.testName} - Sample: ${photoSet.sampleId}`, bold: true }) ]
      })
    ];
  
    // BEFORE
    if (photoSet?.before?.[0]?.data) {
      blocks.push(new Paragraph({ children: [ new TextRun({ text: "Before Test:", bold: true }) ] }));
      blocks.push(new Paragraph({
        children: [
          new ImageRun({
            data: dataUrlToUint8Array(photoSet.before[0].data),
            transformation: { width: 360, height: 240 } // tweak sizes as you like
          })
        ],
        alignment: AlignmentType.CENTER
      }));
    } else {
      blocks.push(new Paragraph({
        children: [ new TextRun({ text: "[No before photos available]", italics: true }) ],
        alignment: AlignmentType.CENTER
      }));
    }
  
    // AFTER
    if (photoSet?.after?.[0]?.data) {
      blocks.push(new Paragraph({ children: [ new TextRun({ text: "After Test:", bold: true }) ] }));
      blocks.push(new Paragraph({
        children: [
          new ImageRun({
            data: dataUrlToUint8Array(photoSet.after[0].data),
            transformation: { width: 360, height: 240 }
          })
        ],
        alignment: AlignmentType.CENTER
      }));
    } else {
      blocks.push(new Paragraph({
        children: [ new TextRun({ text: "[No after photos available]", italics: true }) ],
        alignment: AlignmentType.CENTER
      }));
    }
  
    blocks.push(new Paragraph({ text: "" }));
    return blocks;
  }),
  
                                
                                new Paragraph({ text: "" }),
                                new Paragraph({ text: "" }),
                                
                                new Paragraph({ 
                                    children: [new TextRun({ text: "---End of Report---", bold: true })],
                                    alignment: AlignmentType.CENTER 
                                })
                            ]
                        }
                    ]
                });
                
                // Generate and save document
                const Packer = window.docx.Packer;
                const blob = await Packer.toBlob(doc);
                const filename = `Reliability_Test_Report_${modelName.replace(/\s+/g, '_')}_${request.productClass}_${formatDate(new Date()).replace(/-/g, '_')}_${reportNo.split('/').pop()}.docx`;
                saveAs(blob, filename);
                
                // Store report metadata
                labData.skuReports[skuId] = {
                    filename: filename,
                    generatedAt: new Date(),
                    reportNo: reportNo
                };
                
                // Clear photos from memory after report generation
                clearSKUPhotos(skuId);
                
                showAlert(`Test report generated for ${modelName}! Images have been embedded.`, 'success');
                
            } catch (error) {
                console.error('Report generation error:', error);
                showAlert('Error generating report: ' + error.message, 'error');
            }
        }
        // Clear photos from memory after report generation
        function clearSKUPhotos(skuId) {
            try {
                // Clear photos for this SKU from memory
                if (labData.skuPhotos[skuId]) {
                    delete labData.skuPhotos[skuId];
                }
                
                // Also clear from testFiles if stored there
                Object.keys(labData.testFiles).forEach(key => {
                    if (key.includes(skuId)) {
                        delete labData.testFiles[key];
                    }
                });
            } catch (error) {
                console.error('Error clearing SKU photos:', error);
            }
        }
        
        // MODIFIED: Export to Excel without verbose alert
        function exportToExcel() {
            try {
                // Prepare data for the specified Excel format
                const exportData = [];
                let slNo = 1;
                
                // Process all requests in test queue
                labData.testQueue.forEach(request => {
                    // Process each SKU
                    for (let sku = 1; sku <= request.numSKUs; sku++) {
                        const modelName = request.skuNames?.[sku] || `SKU${sku}`;
                        const skuId = getSKUIdForRequest(request, sku);
                        
                        // Get or generate test request number (consistent)
                        const testRequestNo = generateTestRequestNumber(request.productType, modelName, skuId);
                        
                        // Determine product classification
                        let ownPlanECNNewLaunch = '';
                        if (request.productClass === 'ECN') {
                            ownPlanECNNewLaunch = 'ECN';
                        } else if (request.productClass === 'NP') {
                            ownPlanECNNewLaunch = 'New Launch';
                        }
                        
                        // Check if SKU has any NC
                        let hasNC = 'N';
                        let anyRemarks = 'Passed';
                        let ncReportDate = '';
                        let ncReportNo = '';
                        let productResult = 'PASSED';
                        
                        // Get all samples for this SKU
                        const skuSamples = request.samples.filter(s => s.sku === sku);
                        
                        // Check results for this SKU
                        let skuHasFailed = false;
                        let skuHasNC = false;
                        let remarksCollection = [];
                        
                        skuSamples.forEach(sample => {
                            sample.tests.forEach(testName => {
                                const result = sample.testResults[testName];
                                if (result) {
                                    if (result.result === 'fail') {
                                        skuHasFailed = true;
                                        hasNC = 'Y';
                                        if (result.remarks) {
                                            remarksCollection.push(`${testName}: ${result.remarks}`);
                                        }
                                    } else if (result.hasNcObservation) {
                                        skuHasNC = true;
                                        hasNC = 'Y';
                                        if (result.remarks) {
                                            remarksCollection.push(`${testName} (Observation): ${result.remarks}`);
                                        }
                                    }
                                }
                            });
                        });
                        
                        // Set product result
                        if (skuHasFailed) {
                            productResult = 'FAILED';
                            anyRemarks = remarksCollection.length > 0 ? remarksCollection.join('; ') : 'Failed';
                        } else if (skuHasNC) {
                            productResult = 'PASSED';
                            anyRemarks = remarksCollection.length > 0 ? remarksCollection.join('; ') : 'Passed with observations';
                        } else {
                            productResult = 'PASSED';
                            anyRemarks = 'Passed';
                        }
                        
                        // If has NC, set NC report details
                        if (hasNC === 'Y') {
                            ncReportDate = formatDate(new Date(request.submittedAt));
                            labData.ncReportCounter++;
                            ncReportNo = labData.ncReportCounter.toString();
                        }
                        
                        // Get report number (consistent)
                        const reportNo = generateReportNumber(request.productClass, modelName, skuId);
                        
                        // Create row data
                        const rowData = {
                            'SL NO.': slNo++,
                            'CATEGORY': request.productType.toUpperCase(),
                            'MODEL': modelName,
                            'TEST REQUEST NO.': testRequestNo,
                            'Own Plan / ECN / New Launch': ownPlanECNNewLaunch,
                            'REPORT DATE': formatDate(new Date()),
                            'REPORT NO': reportNo,
                            'Remarks': anyRemarks,
                            'ANY NC (Y/N)': hasNC,
                            'NC REPORT DATE': ncReportDate,
                            'NC REPORT NO': ncReportNo,
                            'NC Action Items': '',
                            'NC Target Closure Date': '',
                            'NO OF SAMPLES RECEIVED': request.numSamples,
                            'PRODUCT RESULT': productResult
                        };
                        
                        exportData.push(rowData);
                    }
                });
                
                // Convert to CSV format with enhanced formatting
                if (exportData.length === 0) {
                    showAlert('No data to export', 'warning');
                    return;
                }
                
                // Create CSV content with proper formatting
                const headers = Object.keys(exportData[0]);
                
                // Create header row with color formatting instructions
                let csvContent = 'sep=,\n'; // Excel separator instruction
                csvContent += headers.join(',') + '\n';
                
                exportData.forEach(row => {
                    const values = headers.map(header => {
                        const value = row[header];
                        // Escape commas and quotes in values
                        const escapedValue = String(value).replace(/"/g, '""');
                        // Wrap in quotes to preserve formatting
                        return `"${escapedValue}"`;
                    });
                    csvContent += values.join(',') + '\n';
                });
                
                // Create enhanced Excel file using a data URI with Excel-specific formatting
                const BOM = '\uFEFF'; // Byte Order Mark for UTF-8
                const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `Lab_Products_Report_${formatDate(new Date()).replace(/-/g, '_')}.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
                
                // REMOVED verbose export success alert
                
            } catch (error) {
                console.error('Export error:', error);
                showAlert('Error exporting data: ' + error.message, 'error');
            }
        }
        
        // Helper function to get SKU ID for a request
        function getSKUIdForRequest(request, skuNumber) {
            const modelName = request.skuNames?.[skuNumber] || `SKU${skuNumber}`;
            return `${request.productClass}-${request.productType}-${modelName}-${request.id}`;
        }
        
        // Show product stats
        function showProductStats() {
            try {
                const modal = document.getElementById('productStatsModal');
                const content = document.getElementById('productStatsContent');
                
                if (!modal || !content) return;
                
                const stats = {
                    NP: 0,
                    RP: 0,
                    ECN: 0
                };
                
                // Count unique SKUs by classification
                labData.testQueue.forEach(request => {
                    stats[request.productClass] += request.numSKUs;
                });
                
                let html = '<h4>Total SKUs Received by Classification</h4><div class="grid">';
                
                Object.entries(stats).forEach(([type, count]) => {
                    html += `
                        <div class="metric-card">
                            <div class="metric-label">${type}</div>
                            <div class="metric-value">${count}</div>
                        </div>
                    `;
                });
                
                html += '</div>';
                
                content.innerHTML = html;
                modal.style.display = 'flex';
            } catch (error) {
                console.error('Product stats modal error:', error);
            }
        }
        
        // Show completed stats
        function showCompletedStats() {
            try {
                const modal = document.getElementById('productStatsModal');
                const content = document.getElementById('productStatsContent');
                
                if (!modal || !content) return;
                
                const passedStats = { 
                    NP: 0,
                    RP: 0,
                    ECN: 0
                };
                
                labData.completedProducts.forEach(product => {
                    if (product.productClass && passedStats[product.productClass] !== undefined) {
                        passedStats[product.productClass]++;
                    }
                });
                
                let html = '<h4>Products Passed All Tests</h4><div class="grid">';
                
                Object.entries(passedStats).forEach(([type, count]) => {
                    html += `
                        <div class="metric-card">
                            <div class="metric-label">${type}</div>
                            <div class="metric-value" style="color: #81c784;">${count}</div>
                        </div>
                    `;
                });
                
                html += '</div>';
                
                content.innerHTML = html;
                modal.style.display = 'flex';
            } catch (error) {
                console.error('Completed stats modal error:', error);
            }
        }
        
        // Show NC stats with breakdown
        function showFailedStats() {
            try {
                const modal = document.getElementById('productStatsModal');
                const content = document.getElementById('productStatsContent');
                
                if (!modal || !content) return;
                
                const ncBreakdown = getNCBreakdown();
                
                let html = '<h4>NC (Non-Conformity) Breakdown</h4>';
                
                // Failed products section
                html += '<div style="margin-bottom: 30px;">';
                html += '<h5 style="color: #ff5252; margin-bottom: 15px;">SKUs Failed in Tests</h5>';
                html += '<div class="grid">';
                
                html += `
                    <div class="metric-card">
                        <div class="metric-label">Total Failed</div>
                        <div class="metric-value" style="color: #ff5252;">${ncBreakdown.failed.total}</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">NP</div>
                        <div class="metric-value" style="color: #ff5252;">${ncBreakdown.failed.NP}</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">RP</div>
                        <div class="metric-value" style="color: #ff5252;">${ncBreakdown.failed.RP}</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">ECN</div>
                        <div class="metric-value" style="color: #ff5252;">${ncBreakdown.failed.ECN}</div>
                    </div>
                `;
                
                html += '</div></div>';
                
                // Passed with NC section
                html += '<div>';
                html += '<h5 style="color: #ffb74d; margin-bottom: 15px;">SKUs Passed but have NC/Observations</h5>';
                html += '<div class="grid">';
                
                html += `
                    <div class="metric-card">
                        <div class="metric-label">Total with NC</div>
                        <div class="metric-value" style="color: #ffb74d;">${ncBreakdown.passedWithNC.total}</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">NP</div>
                        <div class="metric-value" style="color: #ffb74d;">${ncBreakdown.passedWithNC.NP}</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">RP</div>
                        <div class="metric-value" style="color: #ffb74d;">${ncBreakdown.passedWithNC.RP}</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">ECN</div>
                        <div class="metric-value" style="color: #ffb74d;">${ncBreakdown.passedWithNC.ECN}</div>
                    </div>
                `;
                
                html += '</div></div>';
                
                content.innerHTML = html;
                modal.style.display = 'flex';
            } catch (error) {
                console.error('Failed stats modal error:', error);
            }
        }
        
        // FEATURE 2: Generate NC/Observation PPT Slide with Photos - FIXED with proper photo fitting
        async function generateNCSlide(testData, sampleData, request) {
            try {
                // Check if PptxGenJS is available and has the required version
                if (typeof PptxGenJS === 'undefined') {
                    showAlert('PowerPoint library is loading, please try again in a moment', 'warning');
                    return;
                }
                
                // Check PptxGenJS version
                if (PptxGenJS.version && PptxGenJS.version < '3.0.0') {
                    showAlert('Please ensure PptxGenJS v3.0.0 or higher is loaded', 'error');
                    return;
                }
                
                // Create a new presentation
                const pptx = new PptxGenJS();
                
                // Set presentation properties
                pptx.author = 'V-Guard Reliability Lab';
                pptx.company = 'V-Guard Industries Ltd';
                pptx.title = `NC Report - ${sampleData.modelName}`;
                
                // Add a slide
                const slide = pptx.addSlide();
                
                // Set slide background
                slide.background = { color: 'FFFFFF' };
                
                // Add title
                slide.addText(
                    `NC_Product Reliability - ${request.productType.toUpperCase()}`,
                    {
                        x: 0.5,
                        y: 0.3,
                        w: 9,
                        h: 0.5,
                        fontSize: 24,
                        bold: true,
                        color: '000000',
                        align: 'center',
                        underline: true
                    }
                );
                
                // Add NC identifier
                slide.addText(
                    `NC_${sampleData.modelName}_${Date.now().toString().slice(-8)}`,
                    {
                        x: 0.5,
                        y: 0.8,
                        w: 9,
                        h: 0.3,
                        fontSize: 14,
                        bold: true,
                        color: 'FF0000',
                        align: 'left'
                    }
                );
                
                // Prepare table data - MODIFIED to have blank Action and Target Date
                const tableRows = [
                    [
                        { text: 'Date', options: { bold: true, fill: 'F0F0F0' } },
                        { text: 'Model Name/Type', options: { bold: true, fill: 'F0F0F0' } },
                        { text: 'Existing/New/ECN', options: { bold: true, fill: 'F0F0F0' } },
                        { text: 'Test Type', options: { bold: true, fill: 'F0F0F0' } },
                        { text: 'NC Observed', options: { bold: true, fill: 'F0F0F0' } },
                        { text: 'Specification', options: { bold: true, fill: 'F0F0F0' } },
                        { text: 'NC Type and Severity', options: { bold: true, fill: 'F0F0F0' } },
                        { text: 'Action', options: { bold: true, fill: 'F0F0F0' } },
                        { text: 'Target Date', options: { bold: true, fill: 'F0F0F0' } }
                    ],
                    [
                        formatDate(new Date()),
                        sampleData.modelName,
                        request.productClass === 'NP' ? 'New' : request.productClass === 'RP' ? 'Existing' : 'ECN',
                        testData.test,
                        testData.remarks,
                        testData.selectedSpecSet ? 
                            testData.selectedSpecSet.parameters.map(p => `${p.name}: ${p.value}`).join(', ') : 
                            'As per test plan',
                        testData.ncType,
                        '', // Action - blank for manual input
                        ''  // Target Date - blank for manual input
                    ]
                ];
                
                // Add table to slide
                slide.addTable(tableRows, {
                    x: 0.5,
                    y: 1.3,
                    w: 9,
                    fontSize: 10,
                    border: { pt: 1, color: '000000' },
                    autoPage: false
                });
                
                // Add "Actual NC Part Image" title
                slide.addText(
                    'Actual NC Part Image',
                    {
                        x: 0.5,
                        y: 3.0,
                        w: 9,
                        h: 0.4,
                        fontSize: 18,
                        bold: true,
                        color: '008000',
                        align: 'center'
                    }
                );
                
                // Get the test files with validation
                const testKey = `${sampleData.id}-${testData.test}`;
                const beforePhoto = sampleData.testFiles?.[testKey]?.before?.[0];
                const afterPhoto = sampleData.testFiles?.[testKey]?.after?.[0];
                
                // Validate image sizes (5MB limit)
                const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
                if (beforePhoto && beforePhoto.data) {
                    const size = beforePhoto.data.length * 0.75; // Approximate base64 size
                    if (size > MAX_IMAGE_SIZE) {
                        showAlert('Warning: Before image is too large. Please use images smaller than 5MB.', 'warning');
                    }
                }
                if (afterPhoto && afterPhoto.data) {
                    const size = afterPhoto.data.length * 0.75; // Approximate base64 size
                    if (size > MAX_IMAGE_SIZE) {
                        showAlert('Warning: After image is too large. Please use images smaller than 5MB.', 'warning');
                    }
                }
                
                // Add "Before Test" heading
                slide.addText(
                    'BEFORE TEST',
                    {
                        x: 1.0,
                        y: 3.5,
                        w: 3.5,
                        h: 0.3,
                        fontSize: 12,
                        bold: true,
                        align: 'center',
                        color: '0000FF'
                    }
                );
                
                // Add "After Test" heading
                slide.addText(
                    'AFTER TEST',
                    {
                        x: 5.5,
                        y: 3.5,
                        w: 3.5,
                        h: 0.3,
                        fontSize: 12,
                        bold: true,
                        align: 'center',
                        color: 'FF0000'
                    }
                );
                
                // Add photos if available - FIXED to fit properly
// Add photos if available — SYNC version (no Image() callbacks)

// BEFORE image
if (beforePhoto?.data) {
    slide.addImage({
      data: beforePhoto.data,           // full data URL: "data:image/jpeg;base64,..."
      x: 1.0, y: 3.9, w: 3.5, h: 2.3,
      sizing: { type: 'contain' }
    });
  } else {
    slide.addShape(PptxGenJS.ShapeType.rect, {  // note: PptxGenJS.*, not pptx.*
      x: 1.0, y: 3.9, w: 3.5, h: 2.3,
      fill: 'F0F0F0',
      line: { color: '999999', width: 1 }
    });
    slide.addText('No Before Image Available', {
      x: 1.0, y: 4.8, w: 3.5, h: 0.5,
      fontSize: 12, color: '999999', align: 'center'
    });
  }
  
  // AFTER image
  if (afterPhoto?.data) {
    slide.addImage({
      data: afterPhoto.data,
      x: 5.5, y: 3.9, w: 3.5, h: 2.3,
      sizing: { type: 'contain' }
    });
  } else {
    slide.addShape(PptxGenJS.ShapeType.rect, {
      x: 5.5, y: 3.9, w: 3.5, h: 2.3,
      fill: 'F0F0F0',
      line: { color: '999999', width: 1 }
    });
    slide.addText('No After Image Available', {
      x: 5.5, y: 4.8, w: 3.5, h: 0.5,
      fontSize: 12, color: '999999', align: 'center'
    });
  }
                  // Add observation text below images if available
                if (testData.remarks) {
                    slide.addText(
                        `Observation: ${testData.remarks}`,
                        {
                            x: 0.5,
                            y: 6.3,
                            w: 9,
                            h: 0.5,
                            fontSize: 11,
                            color: 'FF0000',
                            align: 'center',
                            italic: true
                        }
                    );
                }
                
                // Generate a unique filename
                const baseFilename = `NC_Slide_${sampleData.modelName.replace(/[^a-z0-9_\-]/gi, '_')}_${testData.test.replace(/[^a-z0-9_\-]/gi, '_')}_${Date.now()}`;
                const pptxFilename = `${baseFilename}.pptx`;
                const zipFilename = `${baseFilename}.zip`;
                
                // Generate the PPTX file
                const pptxBlob = await pptx.write({ outputType: 'blob' });
                
                // Create a new ZIP file
                const zip = new JSZip();
                zip.file(pptxFilename, pptxBlob);
                
                // Generate the ZIP file
                const zipContent = await zip.generateAsync({
                    type: 'blob',
                    compression: 'DEFLATE',
                    compressionOptions: {
                        level: 6
                    }
                });
                
                // Create download link
                const url = URL.createObjectURL(zipContent);
                const a = document.createElement('a');
                a.href = url;
                a.download = zipFilename;
                document.body.appendChild(a);
                a.click();
                
                // Clean up
                setTimeout(() => {
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                    showAlert(`NC/Observation PowerPoint slide generated and zipped for ${sampleData.modelName} - ${testData.test}!`, 'success');
                }, 100);
                
            } catch (error) {
                console.error('NC slide generation error:', error);
                showAlert('Error generating NC slide: ' + error.message, 'error');
            }
        }
        
        // Format date helper
        function formatDate(date) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}-${month}-${year}`;
        }
        
        // Format date and time helper
        function formatDateTime(date) {
            if (!(date instanceof Date) || isNaN(date)) return 'Invalid Date';
            
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            
            return `${day}-${month}-${year} ${hours}:${minutes}`;
        }
        
        // Format time in Days:Hours:Minutes format
        function formatTimeInDHM(hours) {
            const days = Math.floor(hours / 24);
            const remainingHours = Math.floor(hours % 24);
            const minutes = Math.round((hours - Math.floor(hours)) * 60);
            
            const parts = [];
            if (days > 0) parts.push(`${days}d`);
            if (remainingHours > 0 || days > 0) parts.push(`${remainingHours}h`);
            parts.push(`${minutes}m`);
            
            return parts.join(' ');
        }
        
        // Check if all tests for an SKU are completed and generate report
        function checkSKUCompletion(request, skuId) {
            const skuSamples = request.samples.filter(s => getSKUId(s.id) === skuId);
            const allCompleted = skuSamples.every(sample => {
                return sample.status === 'completed' && 
                       sample.tests.every(testName => sample.testResults[testName]);
            });
            
            if (allCompleted && !labData.skuReports[skuId]) {
                // Auto-generate report for completed SKU
                generateWordReport(skuId, request, request.samples);
            }
        }
        // MODIFIED: Update test result with all fixes
        function updateTestResult() {
            try {
                const testToUpdate = document.getElementById('testToUpdate')?.value;
                const result = document.getElementById('testResult')?.value;
                const remarksEl = document.getElementById('testRemarks');
                const remarks = remarksEl?.value.trim();
                const hasNcObservation = document.getElementById('hasNcObservation')?.value;
                const ncType = document.getElementById('ncType')?.value;
                
                if (!testToUpdate || !result) {
                    showAlert('Please select a test and result', 'warning');
                    return;
                }
                
                if (!remarks) {
                    showAlert('Remarks are required', 'warning');
                    return;
                }
                
                // Check if NC/Observation type is required
                if (result === 'fail' && !ncType) {
                    showAlert('Please select NC/Observation type for failed test', 'warning');
                    return;
                }
                
                if (result === 'pass' && hasNcObservation === 'yes' && !ncType) {
                    showAlert('Please select NC/Observation type', 'warning');
                    return;
                }
                
                // Check if files are uploaded
                if (!labData.testFiles.currentTest || 
                    !labData.testFiles.currentTest.before || 
                    labData.testFiles.currentTest.before.length === 0 ||
                    !labData.testFiles.currentTest.after || 
                    labData.testFiles.currentTest.after.length === 0) {
                    showAlert('Please upload before and after photos/videos', 'warning');
                    return;
                }
                
                const [sampleId, testName] = testToUpdate.split('|');
                
                const activeTestIndex = labData.activeTests.findIndex(t => 
                    t.sampleId === sampleId && t.test === testName
                );
                
                if (activeTestIndex === -1) {
                    showAlert('Test not found', 'error');
                    return;
                }
                
                const activeTest = labData.activeTests[activeTestIndex];
                const request = labData.testQueue.find(r => r.id === activeTest.requestId);
                const sample = request?.samples.find(s => s.id === sampleId);
                
                if (!sample) return;
                
                // Check if this is the final test for the sample
                const isFinalTest = sample.currentTest === sample.tests.length - 1;
                
                // Determine if there's an NC/Observation
                const hasNc = (result === 'fail') || (result === 'pass' && hasNcObservation === 'yes');
                
                // Store test files with the sample (including photos)
                const testKey = `${sampleId}-${testName}`;
                if (!sample.testFiles) {
                    sample.testFiles = {};
                }
                sample.testFiles[testKey] = { ...labData.testFiles.currentTest };
                
                // Store photos for the SKU
                const skuId = getSKUId(sampleId);
                if (!labData.skuPhotos[skuId]) {
                    labData.skuPhotos[skuId] = {};
                }
                labData.skuPhotos[skuId][testKey] = { ...labData.testFiles.currentTest };
                
                // Generate NC slide if there's an NC/Observation
                if (hasNc && ncType) {
                    const testDataForSlide = {
                        test: testName,
                        remarks: remarks,
                        ncType: ncType,
                        selectedSpecSet: activeTest.selectedSpecSet || null
                    };
                    generateNCSlide(testDataForSlide, sample, request);
                }
                
                // Handle test failure scenarios
                let stopRemainingTests = false;
                if (result === 'fail') {
                    if (!isFinalTest) {
                        // Only ask to continue if there are remaining tests
                        const continueTests = confirm(
                            `Test failed for ${sampleId}.\n\n` +
                            `Do you want to continue with the remaining tests on this sample?\n\n` +
                            `Click OK to continue remaining tests\n` +
                            `Click Cancel to stop all tests for this sample`
                        );
                        
                        if (!continueTests) {
                            stopRemainingTests = true;
                            // Mark all remaining tests as skipped
                            for (let i = sample.currentTest + 1; i < sample.tests.length; i++) {
                                sample.testResults[sample.tests[i]] = {
                                    result: 'skipped',
                                    remarks: 'Skipped due to previous test failure',
                                    skippedAt: new Date(),
                                    technician: activeTest.technician
                                };
                            }
                            sample.currentTest = sample.tests.length; // Mark as completed
                            sample.status = 'completed';
                        }
                    } else {
                        // This is the final test, no need to ask
                        stopRemainingTests = true;
                        sample.status = 'completed';
                    }
                }
                
                // FIXED: Update technician workload properly using man hours
                if (activeTest.technician && activeTest.technician !== 'Auto-assigned') {
                    const tech = labData.technicians.find(t => t.name === activeTest.technician);
                    if (tech) {
                        const manHoursToRelease = activeTest.manHours || 0;
                        const techniciansRequired = activeTest.techniciansRequired || 1;
                        tech.currentWorkload = Math.max(0, (tech.currentWorkload || 0) - (manHoursToRelease * techniciansRequired));
                        tech.assignedTests = tech.assignedTests.filter(id => id !== sampleId);
                    }
                }
                
                // Record test result
                sample.testResults[testName] = {
                    result: result,
                    remarks: remarks,
                    hasNcObservation: hasNc,
                    ncType: hasNc ? ncType : null,
                    completedAt: new Date(),
                    technician: activeTest.technician,
                    beforeFiles: labData.testFiles.currentTest.before,
                    afterFiles: labData.testFiles.currentTest.after,
                    selectedSpecSet: activeTest.selectedSpecSet || null
                };
                
                activeTest.status = 'completed';
                activeTest.completedAt = new Date();
                activeTest.result = result;
                activeTest.ncType = hasNc ? ncType : null;
                if (!activeTest.productType || !activeTest.productClass) {
                    const request = labData.testQueue.find(r => r.id === activeTest.requestId);
                    if (request) {
                        activeTest.productType = request.productType;
                        activeTest.productClass = request.productClass;
                        activeTest.testType = request.testType;
                        activeTest.modelName = sample?.modelName || 'Unknown Model';
                    }
                }
                labData.completedTests.push(activeTest);
                labData.activeTests = labData.activeTests.filter(t => 
                    !(t.sampleId === activeTest.sampleId && t.test === activeTest.test)
                );
                
                if (result === 'fail') {
                    labData.failedTests.push({
                        ...activeTest,
                        remarks: remarks,
                        ncType: ncType
                    });
                }
                
                // Move to next test or mark as completed
                if (!stopRemainingTests && !isFinalTest) {
                    sample.currentTest++;
                    sample.status = 'pending';
                } else {
                    sample.status = 'completed';
                    
                    // Check if this sample completion means SKU completion
                    const skuSamples = request.samples.filter(s => getSKUId(s.id) === skuId);
                    const allSamplesCompleted = skuSamples.every(s => s.status === 'completed');
                    
                    if (allSamplesCompleted) {
                        // Check if SKU failed or passed
                        let skuFailed = false;
                        let hasNCObservation = false;
                        
                        skuSamples.forEach(s => {
                            s.tests.forEach(testName => {
                                const testResult = s.testResults[testName];
                                if (testResult) {
                                    if (testResult.result === 'fail') {
                                        skuFailed = true;
                                    }
                                    if (testResult.hasNcObservation) {
                                        hasNCObservation = true;
                                    }
                                }
                            });
                        });

                        // Find this section where it says "// Check if SKU failed or passed"
// Add this code right after the SKU completion check:
 
// Track on-time completion
const request = labData.testQueue.find(r => r.id === activeTest.requestId);
if (request && allSamplesCompleted) {
    labData.totalCompletions++;
    
    // Check if completed on time
const deadline = labData.requestDeadlines[request.id];
    if (deadline) {
        const completionTime = new Date();
        if (completionTime <= deadline.expectedCompletion) {
            labData.onTimeCompletions++;
        }
    }
}


                        
                        const productId = skuId;
                        
                        // Track the product status
                        if (skuFailed) {
                            // Product failed - add to failed products
                            if (!labData.failedProducts.some(p => p.productId === productId)) {
                                labData.failedProducts.push({
                                    productId: productId,
                                    modelName: sample.modelName,
                                    productType: request.productType,
                                    productClass: request.productClass,
                                    testType: request.testType,
                                    failedAt: new Date()
                                });
                            }
                            
                            // Generate report even for failed SKU
                            generateWordReport(skuId, request, request.samples);
                            
                        } else if (hasNCObservation) {
                            // Product passed with NC
                            if (!labData.completedProducts.some(p => p.productId === productId)) {
                                labData.completedProducts.push({
                                    productId: productId,
                                    modelName: sample.modelName,
                                    productType: request.productType,
                                    productClass: request.productClass,
                                    testType: request.testType,
                                    completedAt: new Date()
                                });
                            }
                            
                            if (!labData.productsWithNC.some(p => p.productId === productId)) {
                                labData.productsWithNC.push({
                                    productId: productId,
                                    modelName: sample.modelName,
                                    productType: request.productType,
                                    productClass: request.productClass,
                                    testType: request.testType,
                                    ncRecordedAt: new Date()
                                });
                            }
                            
                            // Generate report
                            generateWordReport(skuId, request, request.samples);
                            
                        } else {
                            // Product passed without NC
                            if (!labData.completedProducts.find(p => p.productId === productId)) {
                                labData.completedProducts.push({
                                    productId: productId,
                                    modelName: sample.modelName,
                                    productType: request.productType,
                                    productClass: request.productClass,
                                    testType: request.testType,
                                    completedAt: new Date()
                                });
                            }
                            
                            // Generate report
                            generateWordReport(skuId, request, request.samples);
                        }
                        
                        // Ask about lifecycle testing only if passed
                        if (!skuFailed && confirm(`All tests completed for ${sample.modelName}.\n\nDo you want to put this product in life cycle testing?`)) {
                            addToLifecycle(productId, {
                                productType: request.productType,
                                productClass: request.productClass,
                                modelName: sample.modelName
                            });
                        }
                    } else if (stopRemainingTests && request.numSamples === 1) {
                        // Single sample SKU with stopped tests - still track as failed
                        const productId = skuId;
                        
                        if (!labData.failedProducts.find(p => p.productId === productId)) {
                            labData.failedProducts.push({
                                productId: productId,
                                modelName: sample.modelName,
                                productType: request.productType,
                                productClass: request.productClass,
                                testType: request.testType,
                                failedAt: new Date()
                            });
                        }
                        
                        // Generate report for single sample failed SKU
                        generateWordReport(skuId, request, request.samples);
                    }
                }
                
                processTestQueue();
                
                // Clear form and file uploads
                ['testToUpdate', 'testResult', 'testRemarks', 'beforeTestFiles', 'afterTestFiles', 'hasNcObservation', 'ncType'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                
                ['beforeFilePreview', 'afterFilePreview'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.innerHTML = '';
                });
                
                // Hide NC sections
                document.getElementById('ncObservationSection')?.classList.remove('visible');
                document.getElementById('ncTypeSection')?.classList.remove('visible');
                
                labData.testFiles.currentTest = null;
                
                // Refresh the test dropdown immediately
                refreshTestDropdown();
                
                updateMetrics();
                updateMachineTable();
                showAlert('Test result updated successfully!', 'success');
            } catch (error) {
                console.error('Test result update error:', error);
                showAlert('Error updating test result', 'error');
            }
        }
        
        // MODIFIED: Update metrics with correct counting and calculations
        function updateMetrics() {
            try {
                const machineUtilization = calculateMachineUtilization();
                const manUtilization = calculateManUtilization();
                const mainLeadTime = calculateMainLeadTime();
                const labCapacity = calculateLabCapacity();
                
                const currentShift = getCurrentShift();
                const techniciansInShift = getAvailableTechniciansInShift();
                
                // Count technicians who are assigned to active tests
                const busyTechNames = new Set();
                labData.activeTests.forEach(test => {
                    if (test.technician) {
                        test.technician.split(',').map(t => t.trim()).forEach(name => {
                            busyTechNames.add(name);
                        });
                    }
                });
                
                // Count how many of these technicians are in the current shift
                const busyTechnicians = Array.from(busyTechNames).filter(name => 
                    techniciansInShift.some(t => t.name === name)
                ).length;
                
                // Calculate total SKUs received
                const totalSKUs = calculateTotalReceivedSKUs();
                
                // Calculate products passed (all tests)
                const completedPass = labData.completedProducts.length;
                
                // Calculate NC count (failed + passed with NC)
                const ncCount = calculateNCCount();
                
                const activeProducts = getActiveProducts();

                // Check if any products are in the system

const onTimePercentage = calculateOnTimePercentage();
let onTimeDisplay, onTimeDetail;
 
if (totalSKUs === 0) {
    // No products added to system yet
    onTimeDisplay = 'NA';
    onTimeDetail = 'No products added yet';
} else if (labData.totalCompletions === 0) {
    // Products added but none completed yet
    onTimeDisplay = '0%';
    onTimeDetail = `0/${totalSKUs} products completed`;
} else {
    // Products completed, show actual percentage
    onTimeDisplay = onTimePercentage + '%';
    onTimeDetail = `${labData.onTimeCompletions}/${labData.totalCompletions} products`;
}
                
                // Update DOM elements safely
                const updates = [
                    ['machineUtilization', machineUtilization.toFixed(1) + '%'],
['utilizationBar', null, 'width', machineUtilization.toFixed(1) + '%'],
['manUtilization', manUtilization.toFixed(1) + '%'],
['manUtilizationBar', null, 'width', manUtilization.toFixed(1) + '%'],

                    ['manUtilizationDetail', `${busyTechnicians}/${techniciansInShift.length} technicians busy`],
                    ['totalPowerConsumption', calculateTotalPowerConsumptionKW().toFixed(1) + ' kW'],
                    ['powerConsumptionDetail', buildPowerDetail()],
                    ['activeProducts', activeProducts.length.toString()],
                    ['currentLeadTime', formatTimeInDHM(mainLeadTime)],
                    ['totalReceived', totalSKUs.toString()],
                    ['completedPass', completedPass.toString()],
                    ['failedTests', ncCount.toString()],
                    ['labCapacity', labCapacity],
                    ['capacityMessage', labCapacity === 'MAX LOAD' ? 'Maximum capacity reached' : 'Operating within limits'],
                    ['onTimePercentage', onTimeDisplay],
                    ['onTimeDetail', onTimeDetail],
                ];
                
                updates.forEach(([id, text, style, value]) => {
                    const el = document.getElementById(id);
                    if (el) {
                        if (style) {
                            el.style[style] = value;
                        } else {
                            el.textContent = text;
                        }
                    }
                });
                
                updateMachineTable();
            } catch (error) {
                console.error('Metrics update error:', error);
            }
            if (typeof renderManUtilizationDetails === 'function') { renderManUtilizationDetails(); }
}
        
        // Submit product request (first step)
        function submitProductRequest() {
            try {
                const productTypeEl = document.getElementById('productType');
                const productClassEl = document.getElementById('productClass');
                const testTypeEl = document.getElementById('testType');
                const numSKUsEl = document.getElementById('numSKUs');
                const numSamplesEl = document.getElementById('numSamples');
                
                if (!productTypeEl || !productClassEl || !testTypeEl || !numSKUsEl || !numSamplesEl) {
                    showAlert('Form elements not found', 'error');
                    return;
                }
                
                const productType = productTypeEl.value;
                const productClass = productClassEl.value;
                const testType = testTypeEl.value;
                const numSKUs = parseInt(numSKUsEl.value);
                const numSamples = parseInt(numSamplesEl.value);
                
                if (!productType || !productClass || !testType || !numSKUs || !numSamples) {
                    showAlert('Please fill all fields', 'warning');
                    return;
                }
                
                currentRequest = {
                    id: Date.now(),
                    productType,
                    productClass,
                    testType,
                    numSKUs,
                    numSamples,
                    submittedAt: new Date(),
                    samples: []
                };
                
                // Don't track SKUs here - wait until names are confirmed
                
                // Show SKU names input section
                generateSKUNamesInput();
                document.getElementById('skuNamesSection').style.display = 'block';
                pendingSKUNames = true;
                
                showAlert('Request submitted! Please enter model names for each SKU.', 'info');
            } catch (error) {
                console.error('Product request submission error:', error);
                showAlert('Error submitting request', 'error');
            }
        }
        
        // Get current shift(s) based on time - can return multiple shifts if they overlap
        function getCurrentShift() {
            const now = new Date();
            const hour = now.getHours();
            const minutes = now.getMinutes();
            const timeInHours = hour + (minutes / 60);
            const activeShifts = [];
            
            // Check each shift's time range
            if (timeInHours >= 6 && timeInHours < 14) {
                activeShifts.push('shiftA');  // Shift A: 6:00 AM - 2:00 PM
            }
            if (timeInHours >= 9 && timeInHours < 17.5) {  // 5:30 PM is 17.5 in 24-hour format
                activeShifts.push('shiftG');  // General Shift: 9:00 AM - 5:30 PM
            }
            if (timeInHours >= 14 && timeInHours < 22) {
                activeShifts.push('shiftB');  // Shift B: 2:00 PM - 10:00 PM
            }
            if (timeInHours >= 22 || timeInHours < 6) {
                activeShifts.push('shiftC');  // Shift C: 10:00 PM - 6:00 AM (next day)
            }
            
            return activeShifts;
        }
        
        // Get shift remaining time in hours
        function getShiftRemainingTime(shift = null) {
            const now = new Date();
            const currentHour = now.getHours() + (now.getMinutes() / 60);
            
            // If a specific shift is provided, calculate remaining time for that shift
            if (shift) {
                const shiftData = labData.shiftSchedule[shift];
                if (!shiftData) return 0;
                
                let endHour = shiftData.end;
                // Handle overnight shift (shiftC)
                if (shiftData.end < shiftData.start && currentHour > shiftData.start) {
                    endHour = shiftData.end + 24;
                }
                
                // Calculate remaining hours
                let remaining = endHour - currentHour;
                
                // If remaining is negative, it means the shift has ended
                return Math.max(0, remaining);
            }
            
            // If no shift is provided, calculate for all current shifts and return the minimum remaining time
            const currentShifts = getCurrentShift();
            if (currentShifts.length === 0) return 0;
            
            return Math.min(...currentShifts.map(shiftId => {
                const shiftData = labData.shiftSchedule[shiftId];
                if (!shiftData) return Infinity;
                
                let endHour = shiftData.end;
                if (shiftData.end < shiftData.start && currentHour > shiftData.start) {
                    endHour = shiftData.end + 24;
                }
                
                return Math.max(0, endHour - currentHour);
            }));
        }
        
        // Get available technicians in current shift(s)
        function getAvailableTechniciansInShift(shift = null) {
            try {
                console.group('=== getAvailableTechniciansInShift() ===');
                
                // If no specific shift is provided, get current shifts
                const targetShifts = shift ? [shift] : getCurrentShift();
                console.log('Target shifts:', targetShifts);
                
                if (!targetShifts || targetShifts.length === 0) {
                    console.log('No target shifts found');
                    console.groupEnd();
                    return [];
                }
                
                // Get all technicians in any of the target shifts
                const availableTechs = labData.technicians.filter(t => {
                    const isInShift = targetShifts.includes(t.shift);
                    if (!isInShift) {
                        console.log(`Technician ${t.name} (${t.shift}) not in target shifts:`, targetShifts);
                    }
                    return isInShift;
                });
                
                console.log(`Found ${availableTechs.length} technicians in target shifts`);
                console.groupEnd();
                
                return availableTechs;
            } catch (error) {
                console.error('Error in getAvailableTechniciansInShift:', error);
                console.groupEnd();
                return [];
            }
        }


// Get current shift(s) based on time - can return multiple shifts if they overlap
function getCurrentShift() {
    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const timeInHours = hour + (minutes / 60);
    const activeShifts = [];

    // Check each shift's time range
    if (timeInHours >= 6 && timeInHours < 14) {
        activeShifts.push('shiftA');  // Shift A: 6:00 AM - 2:00 PM
    }
    if (timeInHours >= 9 && timeInHours < 17.5) {  // 5:30 PM is 17.5 in 24-hour format
        activeShifts.push('shiftG');  // General Shift: 9:00 AM - 5:30 PM
    }
    if (timeInHours >= 14 && timeInHours < 22) {
        activeShifts.push('shiftB');  // Shift B: 2:00 PM - 10:00 PM
    }
    if (timeInHours >= 22 || timeInHours < 6) {
        activeShifts.push('shiftC');  // Shift C: 10:00 PM - 6:00 AM (next day)
    }

    return activeShifts;
}
function dedupeActiveTests() {
    const seen = new Set();
    labData.activeTests = (labData.activeTests || []).filter(t => {
      const key = `${t.sampleId}__${t.test}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  

// Get shift remaining time in hours
function getShiftRemainingTime(shift = null) {
    const now = new Date();
    const currentHour = now.getHours() + (now.getMinutes() / 60);

    // If a specific shift is provided, calculate remaining time for that shift
    if (shift) {
        const shiftData = labData.shiftSchedule[shift];
        if (!shiftData) return 0;

        let endHour = shiftData.end;
        // Handle overnight shift (shiftC)
        if (shiftData.end < shiftData.start && currentHour > shiftData.start) {
            endHour = shiftData.end + 24;
        }

        // Calculate remaining hours
        let remaining = endHour - currentHour;

        // If remaining is negative, it means the shift has ended
        return Math.max(0, remaining);
    }

    // If no shift is provided, calculate for all current shifts and return the minimum remaining time
    const currentShifts = getCurrentShift();
    if (currentShifts.length === 0) return 0;

    return Math.min(...currentShifts.map(shiftId => {
        const shiftData = labData.shiftSchedule[shiftId];
        if (!shiftData) return Infinity;

        let endHour = shiftData.end;
        if (shiftData.end < shiftData.start && currentHour > shiftData.start) {
            endHour = shiftData.end + 24;
        }

        return Math.max(0, endHour - currentHour);
    }));
}

// Get available technicians in current shift(s)
function getAvailableTechniciansInShift(shift = null) {
    try {
        console.group('=== getAvailableTechniciansInShift() ===');
        
        // If no specific shift is provided, get current shifts
        if (!shift) {
            const currentShifts = getCurrentShift();
            console.log('Current active shifts:', currentShifts);
            
            if (currentShifts.length === 0) {
                console.log('No active shifts found');
                console.groupEnd();
                return [];
            }
            
            // Get all technicians in any of the current shifts
            const availableTechs = labData.technicians.filter(t => {
                const isInShift = currentShifts.includes(t.shift);
                if (!isInShift) {
                    console.log(`Technician ${t.name} (${t.shift}) not in current shifts:`, currentShifts);
                }
                return isInShift;
            });
            
            console.log(`Found ${availableTechs.length} technicians in current shifts`);
            console.groupEnd();
            return availableTechs;
        }
        
        // If specific shift is provided, filter by that shift
        const shiftTechs = labData.technicians.filter(t => t.shift === shift);
        console.log(`Found ${shiftTechs.length} technicians in shift ${shift}`);
        console.groupEnd();
        return shiftTechs;
    } catch (error) {
        console.error('Error in getAvailableTechniciansInShift:', error);
        console.groupEnd();
        return [];
    }
}

// Calculate man utilization based on active tests and technician assignments
function calculateManUtilization() {
    try {
        // Determine active shifts & technicians
        const currentShifts = (typeof getCurrentShift === 'function') ? getCurrentShift() : [];
        const techniciansInShift = (typeof getAvailableTechniciansInShift === 'function')
            ? getAvailableTechniciansInShift()
            : (labData.technicians || []);

        if (!techniciansInShift || techniciansInShift.length === 0) {
            return 0;
        }

        // Build a map for per-tech workload (hours) using robust name matching
        const techMap = new Map();
        techniciansInShift.forEach(t => {
            techMap.set((typeof normalizeName === 'function') ? normalizeName(t.name || '') : String(t.name||'').trim().toLowerCase(), t);
            t.currentWorkload = 0;
        });

        const tests = labData.activeTests || [];
        tests.forEach(test => {
            const names = (typeof namesFromTest === 'function')
                ? namesFromTest(test)
                : String(test?.technician || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            if (!names.length) return;

            // Remaining work for the test
            let rem = 0;
            try {
                rem = (typeof getRemainingManHours === 'function') ? getRemainingManHours(test) : (test.manHours || 0);
            } catch (e) { rem = (test.manHours || 0); }
            if (!(rem > 0)) return;

            const share = rem / Math.max(1, names.length);
            names.forEach(n => {
                const key = n;
                const t = techMap.get(key);
                if (t) {
                    t.currentWorkload = (t.currentWorkload || 0) + share;
                }
            });
        });

        // Compute utilization per technician using THEIR shift remaining time
        let totalPct = 0;
        let counted = 0;
        techniciansInShift.forEach(t => {
            let remTime = 0;
            try { remTime = getShiftRemainingTime(t.shift) || 0; } catch { remTime = 0; }
            if (!(remTime > 0)) {
              const active = (typeof getCurrentShift === 'function') ? getCurrentShift() : [];
              if (active && active.length) {
                const vals = active.map(s => {
                  try { return getShiftRemainingTime(s) || 0; } catch { return 0; }
                }).filter(v => v > 0);
                remTime = vals.length ? Math.min(...vals) : 0;
              }
            }
            let pct = 0;
            if (remTime > 0) {
                pct = Math.min(100, ((t.currentWorkload || 0) / remTime) * 100);
            } else {
                // If their shift has no time left, treat as 0% for averaging
                pct = 0;
            }
            t.currentUtilization = pct;
            totalPct += pct;
            counted += 1;
        });

        const avg = counted ? (totalPct / counted) : 0;
        return avg;
    } catch (e) {
        console.error('Man utilization calculation error:', e);
        return 0;
    }
}

// Get remaining man hours for a test
function getRemainingManHours(test) {
    try {
        console.group(`getRemainingManHours for test ${test.testId || 'unknown'}`);
        
        if (!test) {
            console.log('No test provided');
            console.groupEnd();
            return 0;
        }
        
        // If test is completed, no remaining work
        if (test.status === 'completed') {
            console.log('Test is already completed');
            console.groupEnd();
            return 0;
        }
        
        // If test hasn't started yet, return full man hours
        if (!test.startTime) {
            console.log('Test has not started yet, returning full man hours:', test.manHours || 0);
            console.groupEnd();
            return test.manHours || 0;
        }
        
        const now = new Date();
        const startTime = new Date(test.startTime);
        const elapsedHours = (now - startTime) / (1000 * 60 * 60);
        
        console.log(`Test started at: ${startTime}`);
        console.log(`Current time: ${now}`);
        console.log(`Elapsed hours: ${elapsedHours.toFixed(2)}`);
        
        // Calculate remaining work based on test type
        let remainingManHours = 0;
        
        // For tests with defined work periods
        if (test.technicianWorkPeriods && test.technicianWorkPeriods.length > 0) {
            console.log('Processing work periods:', test.technicianWorkPeriods);
            
            test.technicianWorkPeriods.forEach((period, index) => {
                const periodStart = period.start;
                const periodEnd = period.start + period.duration;
                
                console.log(`Period ${index + 1}: Start=${periodStart}h, End=${periodEnd}h, Duration=${period.duration}h`);
                
                if (elapsedHours < periodStart) {
                    // Period hasn't started yet
                    console.log(`- Period ${index + 1} hasn't started yet`);
                    remainingManHours += period.duration;
                } else if (elapsedHours < periodEnd) {
                    // Currently in this period
                    const remainingInPeriod = periodEnd - elapsedHours;
                    console.log(`- Currently in period ${index + 1}, ${remainingInPeriod.toFixed(2)}h remaining`);
                    remainingManHours += remainingInPeriod;
                } else {
                    console.log(`- Period ${index + 1} is already completed`);
                }
            });
        } else {
            // Fallback for tests without defined work periods
            const totalManHours = test.manHours || 0;
            remainingManHours = Math.max(0, totalManHours - elapsedHours);
            console.log(`No work periods defined, using simple calculation: ${totalManHours}h - ${elapsedHours.toFixed(2)}h = ${remainingManHours.toFixed(2)}h`);
        }
        
        console.log(`Total remaining man hours: ${remainingManHours.toFixed(2)}`);
        console.groupEnd();
        return Math.max(0, remainingManHours);
    } catch (error) {
        console.error('Error in getRemainingManHours:', error);
        console.groupEnd();
        return 0;
    }
}
        
        // Handle shift changes and workload transfer
        

        // Handle shift changes and workload transfer - COMPLETELY FIXED
function handleShiftChange() {
    try {
        const currentShift = getCurrentShift();
        const previousShift = localStorage.getItem('lastShift');
        
        // Only process if shift actually changed
        if (!previousShift || previousShift === currentShift) {
            return;
        }
        
        
        
        const nextShiftTechnicians = getAvailableTechniciansInShift();
        const previousShiftTechnicians = getAvailableTechniciansInShift(previousShift);
        
        if (nextShiftTechnicians.length === 0) {
            
            return;
        }
        
        // Reset workload for technicians from previous shift
        previousShiftTechnicians.forEach(tech => {
            tech.currentWorkload = 0;
            tech.assignedTests = [];
        });
        
        // Transfer active tests to current shift technicians
        labData.activeTests.forEach(test => {
            const remainingManHours = getRemainingManHours(test);
            const remainingCycleTime = getRemainingTestHours(test);
            
            // Only transfer if test is still running
            if (remainingCycleTime > 0) {
                // Sort technicians by workload for load balancing
                const sortedTechs = nextShiftTechnicians.sort((a, b) =>
                    (a.currentWorkload || 0) - (b.currentWorkload || 0)
                );
                
                // Determine how many technicians needed
                const techniciansNeeded = test.techniciansRequired || 1;
                const assignedTechs = [];
                
                // Assign to least busy technicians
                for (let i = 0; i < Math.min(techniciansNeeded, sortedTechs.length); i++) {
                    const tech = sortedTechs[i];
                    
                    // Add test to technician's list
                    if (!tech.assignedTests.includes(test.sampleId)) {
                        tech.assignedTests.push(test.sampleId);
                    }
                    
                    // Calculate work for this technician
                    const workPerTech = remainingManHours / Math.min(techniciansNeeded, sortedTechs.length);
                    const shiftRemaining = getShiftRemainingTime(currentShift);
                    const workInThisShift = Math.min(workPerTech, shiftRemaining);
                    
                    tech.currentWorkload = (tech.currentWorkload || 0) + workInThisShift;
assignedTechs.push(tech.name);
                }
                
                // Store handover information
                if (!test.handoverHistory) {
                    test.handoverHistory = [];
                }
                
                const handoverInfo = {
                    fromShift: previousShift,
                    toShift: currentShift,
                    previousTechnician: test.technician,
                    newTechnician: assignedTechs.join(', '),
                    handoverTime: new Date(),
                    remainingManHours: remainingManHours,
                    remainingCycleTime: remainingCycleTime
                };
                
                test.handoverHistory.push(handoverInfo);
                
                // Update test with new technician(s)
                if (assignedTechs.length > 0) {
                    test.technician = assignedTechs.join(', ');
                    test.needsHandover = false;
                    
                    
                }
            }
        });
        
        // Update localStorage to track current shift
        localStorage.setItem('lastShift', currentShift);
        
        // Update all displays
        updateMetrics();
        updateActiveTestsTable();
        updateTimeline();
        updateTechnicianTable();
        
        
        
    } catch (error) {
        console.error('Shift change handling error:', error);
    }
}

        
        // Get next shift
        function getNextShift(currentShift) {
            const shifts = ['shiftA', 'shiftB', 'shiftC', 'shiftG'];
            const currentIndex = shifts.indexOf(currentShift);
            return shifts[(currentIndex + 1) % shifts.length];
        }

        
    






        function calculateMainLeadTime() {
            try {
                // If no tests in queue and no active tests, return 0
                if (labData.testQueue.length === 0 && labData.activeTests.length === 0) {
                    return 0;
                }
                
                // Build machine availability map by type
                const machinesByType = {};
                labData.machines.forEach(machine => {
                    if (!machinesByType[machine.type]) {
                        machinesByType[machine.type] = [];
                    }
                    machinesByType[machine.type].push(machine);
                });
                
                // Create timeline for each machine to track when it will be free
                const machineTimelines = {};
                const machineQueues = {}; // Track test queues for each machine
                
                // Initialize machine timelines and queues
                labData.machines.forEach(machine => {
                    machineTimelines[machine.id] = 0; // Initially available at time 0
                    machineQueues[machine.id] = []; // Initialize empty queue for each machine
                });
                
                // First, add all currently active tests to machine timelines and queues
                labData.activeTests.forEach(activeTest => {
                    if (activeTest.assignedMachines) {
                        const remainingHours = getRemainingTestHours(activeTest);
                        activeTest.assignedMachines.forEach(machineId => {
                            // Add to machine's queue
                            machineQueues[machineId].push({
                                test: activeTest,
                                remainingHours: remainingHours
                            });
                            // Update machine's timeline
                            machineTimelines[machineId] = remainingHours;
                        });
                    }
                });
                
                // Process test queue in priority order (FIFO)
                let globalMaxCompletionTime = 0;
                const processedSamples = new Set();
                
                // First, process all active tests that are in progress
                labData.testQueue.forEach(request => {
                    request.samples.forEach(sample => {
                        if (sample.status === 'in-progress' || sample.status === 'pending') {
                            let sampleCompletionTime = 0;
                            
                            // Find the active test for this sample, if any
                            const activeTest = labData.activeTests.find(t => t.sampleId === sample.id);
                            
                            if (activeTest) {
                                // Sample is currently being tested
                                const testHours = getRemainingTestHours(activeTest);
                                sampleCompletionTime = testHours;
                            }
                            
                            // Schedule remaining tests
                            for (let i = sample.currentTest; i < sample.tests.length; i++) {
                                const testName = sample.tests[i];
                                const testConfig = sample.testConfigs && sample.testConfigs[i];
                                
                                if (!testConfig) {
                                    console.error(`Missing test config for ${testName} in sample ${sample.id}`);
                                    continue;
                                }
                                if (!testConfig.machines || testConfig.machines.length === 0) {
                                    // For tests with no machine requirements, just add the test duration
                                    const testDuration = testConfig.durationHours || 0;
                                    sampleCompletionTime += testDuration;
                                    continue;
                                }
                                // Schedule this test on its required machines
                                let testStartTime = sampleCompletionTime;
                                let testEndTime = sampleCompletionTime;
                                
                                // Find the latest available time across all required machines
                                testConfig.machines.forEach(machineType => {
                                    const availableMachines = machinesByType[machineType] || [];
                                    if (availableMachines.length === 0) {
                                        console.error(`No machine of type ${machineType} available`);
                                        return;
                                    }
                                    
                                    // Find machine with earliest availability
                                    let bestMachine = null;
                                    let earliestAvailable = Infinity;
                                    
                                    availableMachines.forEach(machine => {
                                        const availableAt = machineTimelines[machine.id] || 0;
                                        if (availableAt < earliestAvailable) {
                                            earliestAvailable = availableAt;
                                            bestMachine = machine;
                                        }
                                    });
                                    
                                    if (bestMachine) {
                                        // The test can't start until all required machines are available
                                        testStartTime = Math.max(testStartTime, earliestAvailable);
                                        testEndTime = testStartTime + (testConfig.durationHours || 0);
                                        
                                        // Update the machine's timeline
                                        machineTimelines[bestMachine.id] = testEndTime;
                                        machineQueues[bestMachine.id].push({
                                            test: { ...testConfig, sampleId: sample.id },
                                            remainingHours: testEndTime - testStartTime
                                        });
                                    }
                                });
                                
                                sampleCompletionTime = testEndTime;
                            }
                            
                            globalMaxCompletionTime = Math.max(globalMaxCompletionTime, sampleCompletionTime);
                            processedSamples.add(sample.id);
                        }
                    });
                });
                
                // Now process any remaining samples that weren't in progress
                labData.testQueue.forEach(request => {
                    request.samples.forEach(sample => {
                        if (!processedSamples.has(sample.id) && sample.status !== 'completed') {
                            let sampleCompletionTime = 0;
                            
                            for (let i = 0; i < sample.tests.length; i++) {
                                const testName = sample.tests[i];
                                const testConfig = sample.testConfigs && sample.testConfigs[i];
                                
                                if (!testConfig) {
                                    console.error(`Missing test config for ${testName} in sample ${sample.id}`);
                                    continue;
                                }
                                
                                // Schedule this test on its required machines
                                let testStartTime = sampleCompletionTime;
                                let testEndTime = sampleCompletionTime;
                                
                                // Find the latest available time across all required machines
                                testConfig.machines.forEach(machineType => {
                                    const availableMachines = machinesByType[machineType] || [];
                                    if (availableMachines.length === 0) {
                                        console.error(`No machine of type ${machineType} available`);
                                        return;
                                    }
                                    
                                    // Find machine with earliest availability
                                    let bestMachine = null;
                                    let earliestAvailable = Infinity;
                                    
                                    availableMachines.forEach(machine => {
                                        const availableAt = machineTimelines[machine.id] || 0;
                                        if (availableAt < earliestAvailable) {
                                            earliestAvailable = availableAt;
                                            bestMachine = machine;
                                        }
                                    });
                                    
                                    if (bestMachine) {
                                        // The test can't start until all required machines are available
                                        testStartTime = Math.max(testStartTime, earliestAvailable);
                                        testEndTime = testStartTime + (testConfig.durationHours || 0);
                                        
                                        // Update the machine's timeline
                                        machineTimelines[bestMachine.id] = testEndTime;
                                        machineQueues[bestMachine.id].push({
                                            test: { ...testConfig, sampleId: sample.id },
                                            remainingHours: testEndTime - testStartTime
                                        });
                                    }
                                });
                                
                                sampleCompletionTime = testEndTime;
                            }
                            
                            globalMaxCompletionTime = Math.max(globalMaxCompletionTime, sampleCompletionTime);
                        }
                    });
                });
                
                return globalMaxCompletionTime;
                
            } catch (error) {
                console.error('Main lead time calculation error:', error);
                return 0;
            }
        }
 
// Helper function to schedule a single test
function scheduleTest(testConfig, earliestStartTime, machinesByType, machineTimelines) {
    let testStartTime = earliestStartTime;
    const selectedMachines = [];
    
    // Find when ALL required machines for this test will be available
    testConfig.machines.forEach(machineType => {
        const availableMachines = machinesByType[machineType] || [];
        if (availableMachines.length === 0) {
            // No machine of this type available - log error and skip this test
            console.error(`CRITICAL: No machine of type ${machineType} available for test`);
            // Instead of returning a huge number, skip this test's time contribution
            // This prevents the unrealistic lead time while still flagging the issue
            return {
                startTime: 0,
                endTime: 0,
                machines: []
            };
        } else {
            // Find the machine that will be free earliest
            let bestMachine = null;
            let bestAvailableTime = Infinity;
            
            availableMachines.forEach(machine => {
                // Machine is available at the later of:
// 1. When it finishes current work (machineTimelines[machine.id])
                // 2. When the sample is ready (earliestStartTime)
                const availableTime = Math.max(
machineTimelines[machine.id],
                    earliestStartTime
                );
                
                if (availableTime < bestAvailableTime) {
                    bestAvailableTime = availableTime;
                    bestMachine = machine;
                }
            });
            
            if (bestMachine) {
                selectedMachines.push(bestMachine);
                // Test can't start until ALL machines are available
                testStartTime = Math.max(testStartTime, bestAvailableTime);
            }
        }
    });
    
    // Calculate when test will complete
    const testEndTime = testStartTime + testConfig.cycleTime;
    
    // Update machine timelines - machines will be busy until test completes
    selectedMachines.forEach(machine => {
machineTimelines[machine.id] = testEndTime;
    });
    
    return {
        startTime: testStartTime,
        endTime: testEndTime,
        machines: selectedMachines
    };
}




        
function calculateLabCapacity() {
    try {
        // Get current utilizations
        const machineUtilization = calculateMachineUtilization();
        const manUtilization = calculateManUtilization();
        
        // Calculate active and pending tests
        const activeTests = labData.activeTests.length;
        const pendingTests = labData.testQueue.reduce((sum, req) => {
            return sum + req.samples.filter(s => s.status === 'pending').length;
        }, 0);
        
        // Calculate machine queue load with more detailed metrics
        let totalMachineQueue = 0;
        let maxQueue = 0;
        let machineCount = 0;
        const machineQueues = calculateMachineQueues();
        
        // Analyze queue distribution
        Object.entries(machineQueues).forEach(([machineId, queue]) => {
            const queueLength = queue.totalQueue || 0;
            totalMachineQueue += queueLength;
            maxQueue = Math.max(maxQueue, queueLength);
            machineCount++;
        });
        
        const avgQueuePerMachine = machineCount > 0 ? totalMachineQueue / machineCount : 0;
        
        // Calculate capacity score (0-100)
        let capacityScore = 100;
        
        // Reduce score based on utilization
        capacityScore -= Math.min(50, machineUtilization * 0.5);
        capacityScore -= Math.min(40, manUtilization * 0.4);
        
        // Reduce score based on queue lengths
        capacityScore -= Math.min(30, (avgQueuePerMachine / 5) * 30); // Max 30% impact
        capacityScore -= Math.min(20, (pendingTests / 50) * 20); // Max 20% impact
        
        // Ensure score is within bounds
        capacityScore = Math.max(0, Math.min(100, capacityScore));
        
        // Determine capacity status
        if (capacityScore < 20) {
            return 'MAX LOAD';
        } else if (capacityScore < 50) {
            return 'HIGH LOAD';
        } else if (capacityScore < 80) {
            return 'NORMAL';
        } else {
            return 'LOW LOAD';
        }
        
    } catch (error) {
        console.error('Lab capacity calculation error:', error);
        return 'NORMAL';
    }
}

        // Save test configurations to localStorage
        function saveTestConfigs() {
            localStorage.setItem('testConfigs', JSON.stringify(labData.testConfigs));
        }

        // Load test configurations from localStorage
        function loadTestConfigs() {
            const savedConfigs = localStorage.getItem('testConfigs');
            if (savedConfigs) {
                labData.testConfigs = JSON.parse(savedConfigs);
            }
        }

        // Initialize default test configurations with specification sets and man hours
        // Global function to edit test configuration
        function editTestConfig(category, index) {
            try {
                console.log('editTestConfig called with:', { category, index });
                console.log('labData:', labData);
                
                // Validate inputs
                if (!category || typeof index === 'undefined') {
                    console.error('Missing required parameters for editTestConfig:', { category, index });
                    showAlert('Error: Missing required parameters', 'error');
                    return;
                }
                
                // Check if labData.testConfigs exists
                if (!labData || !labData.testConfigs) {
                    console.error('labData or labData.testConfigs is not defined');
                    showAlert('Error: Test configurations not loaded', 'error');
                    return;
                }
                
                // Check if category exists
                if (!labData.testConfigs[category]) {
                    console.error('Category not found in testConfigs:', category);
                    console.log('Available categories:', Object.keys(labData.testConfigs));
                    showAlert(`Error: Category '${category}' not found`, 'error');
                    return;
                }
                
                // Check if index is valid
                if (index < 0 || index >= labData.testConfigs[category].length) {
                    console.error('Invalid index for category:', { category, index, length: labData.testConfigs[category].length });
                    showAlert('Error: Invalid test configuration', 'error');
                    return;
                }
                
                // Get the test configuration
                if (!labData.testConfigs || !labData.testConfigs[category]) {
                    console.error('Test configuration category not found:', category);
                    console.error('Available categories:', Object.keys(labData.testConfigs || {}));
                    showAlert(`Error: Test configuration category '${category}' not found`, 'error');
                    return;
                }
                
                const configs = labData.testConfigs[category];
                if (index < 0 || index >= configs.length) {
                    console.error('Invalid test configuration index:', index, 'for category:', category);
                    console.error('Available indices:', { length: configs.length });
                    showAlert('Error: Invalid test configuration', 'error');
                    return;
                }
                
                const config = configs[index];
                console.log('Editing config:', config);
                
                // Set form values
                document.getElementById('configCategory').value = category;
                document.getElementById('testName').value = config.name || '';
                
                // Set cycle time (hours and minutes)
                const cycleHours = Math.floor(config.cycleTime || 0);
                const cycleMinutes = Math.round(((config.cycleTime || 0) % 1) * 60);
                document.getElementById('cycleHours').value = cycleHours;
                document.getElementById('cycleMinutes').value = cycleMinutes;
                
                // Set man hours (hours and minutes)
                const manHours = Math.floor(config.manHours || 0);
                const manMinutes = Math.round(((config.manHours || 0) % 1) * 60);
                document.getElementById('manHours').value = manHours;
                document.getElementById('manMinutes').value = manMinutes;
                
                // Set other fields with proper null/undefined checks
                const techRequiredEl = document.getElementById('techRequired');
                if (techRequiredEl) {
                    const techValue = config.technicians !== undefined && config.technicians !== null ? 
                        parseInt(config.technicians, 10) : 1;
                    techRequiredEl.value = techValue > 0 ? techValue : 1;
                    console.log('Set technicians to:', techRequiredEl.value);
                } else {
                    console.error('techRequired element not found');
                    showAlert('Error: Could not find technicians input field', 'error');
                }
                
                // Set power consumption with proper handling
                const powerEl = document.getElementById('powerConsumption');
                if (powerEl) {
                    powerEl.value = config.power !== undefined && config.power !== null ? config.power : '';
                } else {
                    console.error('powerConsumption element not found');
                }
                
                // Set test procedure
                const procedureEl = document.getElementById('testProcedure');
                if (procedureEl) {
                    procedureEl.value = config.procedure || '';
                } else {
                    console.error('testProcedure element not found');
                }
                
                // Update UI for edit mode
                try {
                    // Find the submit button by its onclick handler
                    const addButton = document.querySelector('button[onclick*="addTestConfig"]');
                    if (addButton) {
                        addButton.textContent = 'Update Configuration';
                        // Store the original onclick handler
                        if (!addButton._originalOnClick) {
                            addButton._originalOnClick = addButton.onclick;
                        }
                        // Update the onclick handler
                        addButton.onclick = function() { 
                            addTestConfig(); 
                        };
                    } else {
                        console.warn('Add/Update button not found, but continuing with edit mode');
                    }
                } catch (error) {
                    console.error('Error updating UI for edit mode:', error);
                    // Continue with edit mode even if UI update fails
                }
                
                // Store the current edit index and category
                window.currentEdit = { category, index };
                
                // Load specification sets if they exist
                const testSpecContainer = document.getElementById('testSpecificationSets');
                if (testSpecContainer) {
                    testSpecContainer.innerHTML = ''; // Clear existing specs
                    
                    if (config.specificationSets && config.specificationSets.length > 0) {
                        // Store the original specification sets with their IDs
                        window.currentSpecificationSets = config.specificationSets.map(set => {
                            // Ensure each set has a unique ID
                            const setId = set.id || `set-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                            return {
                                ...JSON.parse(JSON.stringify(set)), // Deep clone
                                id: setId,
                                parameters: set.parameters || [] // Ensure parameters array exists
                            };
                        });
                        
                        console.log('Current specification sets:', window.currentSpecificationSets);
                        
                        // Render each specification set
                        window.currentSpecificationSets.forEach((set, setIndex) => {
                            console.log('Rendering set:', set.id, set.name);
                            const setElement = document.createElement('div');
                            setElement.className = 'spec-set';
                            setElement.id = set.id;
                            
                            // Create the specification set HTML
                            setElement.innerHTML = `
                                <div class="spec-set-header">
                                    <h4>${set.name || 'New Specification Set'}</h4>
                                    <div>
                                        <button onclick="event.stopPropagation(); editSpecificationSet('${set.id}')" class="btn-secondary">Edit</button>
                                        <button onclick="event.stopPropagation(); removeSpecificationSet('${set.id}')" class="btn-danger">Remove</button>
                                    </div>
                                </div>
                                <div class="spec-parameters">
                                    ${(set.parameters || []).map(param => `
                                        <div class="spec-param">
                                            <span class="param-name">${param.name}:</span>
                                            <span class="param-value">${param.value} ${param.unit || ''}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            `;
                            
                            testSpecContainer.appendChild(setElement);
                        });
                    } else {
                        // Initialize empty array if no specification sets exist
                        window.currentSpecificationSets = [];
                    }
                }
                
                // Ensure labData is properly initialized
                if (!labData) {
                    labData = {};
                }
                
                // Initialize selectedMachinesForConfig if it doesn't exist
                if (!labData.selectedMachinesForConfig || !Array.isArray(labData.selectedMachinesForConfig)) {
                    labData.selectedMachinesForConfig = ['No Machine Required'];
                }
                
                // Update the selected machines display
                const machinesContainer = document.getElementById('selectedMachines');
                if (!machinesContainer) {
                    console.error('Could not find selectedMachines container in the DOM');
                    // Try to find the config form
                    const configForm = document.querySelector('.test-config-form');
                    console.log('Config form exists:', !!configForm);
                    
                    // If we're in a modal, try to find the container there
                    if (configForm) {
                        console.log('Form HTML:', configForm.outerHTML);
                    }
                }
                
                if (config.machines && Array.isArray(config.machines)) {
                    console.log('Setting selected machines from config:', config.machines);
                    labData.selectedMachinesForConfig = [...config.machines];
                    console.log('Updated selectedMachinesForConfig:', labData.selectedMachinesForConfig);
                    
                    // Force a reflow to ensure the container is in the DOM
                    setTimeout(() => {
                        console.log('Calling updateSelectedMachinesDisplay after timeout');
                        updateSelectedMachinesDisplay();
                    }, 100);
                } else {
                    console.log('No machines found in config, defaulting to No Machine Required');
                    labData.selectedMachinesForConfig = ['No Machine Required'];
                    updateSelectedMachinesDisplay();
                    
                }
                
                console.log('Edit form populated successfully with specification sets');
                
            } catch (error) {
                console.error('Error in editTestConfig:', error);
                showAlert('Error loading test configuration for editing', 'error');
            }
        }
        
        // Add cancel edit function
        function cancelEdit() {
            document.getElementById('addTestBtn').textContent = 'Add Test';
            document.getElementById('cancelEditBtn').style.display = 'none';
            document.getElementById('testConfigForm').reset();
            delete window.currentEdit;
        }
        
        function initializeDefaultConfigs() {
            // Only initialize default configs if none exist
            if (Object.keys(labData.testConfigs).length === 0) {
                labData.testConfigs = {
                // Mixer Grinder Test Configurations
                'stabilizer': [
                    {
                        name: 'Normal Load Test (80% Load)',
                        cycleTime: 8, // hours
                        manHours: 0.67,
                        machines: ['63_a_voltage_synchroniser','load_bank','data_acquisition_system'],
                        power: 47.9,
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Test Parameters',
                                parameters: [
                                    { name: 'To be cheacked at Capacity', value: '70%' },
                                    { name: 'To be cheacked at Capacity', value: '80%' },
                                    { name: 'To be cheacked at Capacity', value: '60%' }
                                ]
                            }
                        ],
                        procedure: '1. Connect stabilizer to power source\n' +
                                 '2. Use Voltage synchroniser 600V/63A, RLC load bank 10kW and Data Acquisition System 100 W\n' +
                                 '3. Product to be checked at the specified Capacities\n'+
                                 '4. Document all parameters and observations'
                    },
                    {
                        name: 'Overload Test',
                        cycleTime: 1, // hours
                        manHours: 1,
                        machines: ['63_a_voltage_synchroniser','load_bank','data_acquisition_system'],
                        power: 47.9,
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Test Parameters',
                                parameters: [
                                    { name: 'Test Type', value: 'Overload' },
                                    { name: 'Load Increment', value: '5% ,10% increase of actual load' },
                                    { name: 'Expected', value: 'Tripping at overload' }
                                ]
                            }
                        ],
                        procedure: '1. Start with no load\n' +
                                 '2. Increase load in 5%,10% steps\n' +
                                 '3. Verify tripping at overload condition\n' +
                                 '4. Document tripping points and behavior'
                    },
                    {
                        name: 'Relay Switching Test',
                        cycleTime: 8, // hours
                        manHours: 2,
                        machines: ['63_a_voltage_synchroniser','load_bank'],
                        power: 47.8,
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Test Parameters',
                                parameters: [
                                    { name: 'To be cheacked at Capacity', value: '70%' },
                                    { name: 'To be cheacked at Capacity', value: '80%' },
                                    { name: 'To be cheacked at Capacity', value: '60%' },
                                    { name: 'Test duration for all change over points', value: '4 hours' },
                                ]
                            }
                        ],
                        procedure: '1.  Product to be checked at the specified Capacities on all change over points \n' +
                                 '2. Cycle through all changeover points\n' +
                                 '3. Monitor for 4 hours\n' +
                                 '4. Verify no relay failures\n' +
                                 '5. Document all observations'
                    },
                    {
                        name: 'Thermal Cyclic Test',
                        cycleTime: 8, // hours (4h bucking + 4h boosting)
                        manHours: 2,
                        machines: ['env_chamber','dimmer'],
                        power: 16.8,
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Test Conditions',
                                parameters: [
                                    { name: 'Temperature', value: '55°C' },
                                    { name: 'Humidity', value: '50% RH' },
                                    { name: 'Environmental chamber', value: '8kW' },
                                    { name: 'Dimmer', value: '0-300V/28A' },
                                ]
                            }
                        ],
                        procedure: '1. Place stabilizer in environmental chamber\n' +
                                 '2. Set to 55°C and 50% RH\n' +
                                 '3. Run machine as specified\n' +
                                 '4. Monitor for any failures\n' +
                                 '5. Document all parameters and observations'
                    },
                    {
                        name: 'SST',
                        cycleTime: 72,
                        manHours: 10,
                        machines: ['salt_fog_test_chamber'],
                        power: 5,
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Test Parameters',
                                parameters: [
                                    { name: 'Duration', value: '72 hours' },
                                    { name: 'Equipment', value: 'SST Machine' }
                                ]
                            }
                        ],
                        procedure: '1. Connect product to SST machine\n2. Run test for 72 hours\n3. Monitor for any failures\n4. Document all parameters and observations'
                    },
                    {
                        name: 'Application Test',
                        cycleTime: 240, // hours (30 days)
                        manHours: 0.16,
                        machines: ['No Machine Required'],
                        power: 15,
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Test Parameters',
                                parameters: [
                                    { name: 'Test Duration', value: '10 days' },
                                    { name: 'Man Hours', value: '10 min' },
                                    { name: 'Used with', value: 'AC/Refrigerator' },
                                    { name: 'Purpose', value: 'Long-term reliability' }
                                ]
                            }
                        ],
                        procedure: '1. Install stabilizer in real-world application\n' +
                                 '2. Monitor performance for 30 days\n' +
                                 '3. Record voltage regulation and response times\n' +
                                 '4. Document any issues or anomalies\n' +
                                 '5. Verify long-term reliability\n' +
                                 '6. Compile final test report'
                    }
                ],
                'Mixer Grinder': [
                    {
                        name: 'Temperature Rise Test',
                        cycleTime: 0.5, // 30 minutes
                        manHours: 0.5, // 30 minutes
                        machines: ['No Machine Required'],
                        power: 2,
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Standard',
                                parameters: [
                                    { name: 'Voltage', value: '216V' },
                                    { name: 'Load', value: 'Rated Full Load' },
                                    { name: 'Cycle', value: '5 min ON / 2 min OFF' },
                                    { name: 'Max Temperature', value: '115°C' },
                                    { name: 'Duration', value: '30 minutes' }
                                ]
                            }
                        ],
                        procedure: '1. Connect mixer to external generator set at 216V\n' +
                                 '2. Apply rated full load\n' +
                                 '3. Run for 5 minutes ON, 2 minutes OFF cycles\n' +
                                 '4. Monitor temperature rise for 30 minutes\n' +
                                 '5. Verify temperature does not exceed 115°C\n' +
                                 '6. Document temperature readings and observations'
                    },
                    {
                        name: 'Endurance Test',
                        cycleTime: 96, // 96 hours
                        manHours: 15, // 15 hours
                        machines: ['No Machine Required'],
                        power: 15,
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Phase 1 (First 48 hours)',
                                parameters: [
                                    { name: 'Voltage', value: '253V' },
                                    { name: 'Cycle', value: '5 min ON / 2 min OFF' },
                                    { name: 'Cooling', value: 'Forced air cooling' },
                                    { name: 'Rest Periods', value: '30 minutes every 6 cycles' }
                                ]
                            },
                            {
                                id: 'set2',
                                name: 'Phase 2 (After 48 hours)',
                                parameters: [
                                    { name: 'Voltage', value: '207V' },
                                    { name: 'Cycle', value: '5 min ON / 2 min OFF' },
                                    { name: 'Cooling', value: 'Forced air cooling' },
                                    { name: 'Rest Periods', value: '30 minutes every 6 cycles' }
                                ]
                            },
                            {
                                id: 'set3',
                                name: 'Final Checks',
                                parameters: [
                                    { name: 'High Voltage Test', value: '1KV for 60 seconds' },
                                    { name: 'Insulation Resistance', value: '≥ 2 MΩ' },
                                    { name: 'Brush Length', value: 'Check and record' },
                                    { name: 'Commutator OD', value: 'Measure and record' }
                                ]
                            }
                        ],
                        procedure: '1. Set panel timer for 5 minutes ON and 2 minutes OFF cycles\n' +
                                 '2. Load the generator on the mixer grinder\n' +
                                 '3. Set voltage to 253V for first 48 hours\n' +
                                 '4. Apply forced air cooling during operation\n' +
                                 '5. After 48 hours, check and record brush length\n' +
                                 '6. Change voltage to 207V for next 48 hours\n' +
                                 '7. After 96 hours, perform high-voltage test at 1KV for 60 seconds\n' +
                                 '8. Check insulation resistance (min 2 MΩ)\n' +
                                 '9. Measure and record final brush length and commutator OD\n' +
                                 '10. If any ON hours remain, continue testing at 230V\n' +
                                 '11. Document all measurements and observations'
                    },
                    {
                        name: 'SST',
                        cycleTime: 72,
                        manHours: 10,
                        machines: ['salt_fog_test_chamber'],
                        power: 5,
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Test Parameters',
                                parameters: [
                                    { name: 'Duration', value: '72 hours' },
                                    { name: 'Equipment', value: 'SST Machine' }
                                ]
                            }
                        ],
                        procedure: '1. Connect product to SST machine\n2. Run test for 72 hours\n3. Monitor for any failures\n4. Document all parameters and observations'
                    },
                    {
                        name: 'Application Test',
                        cycleTime: 720, // hours (30 days)
                        manHours: 32,
                        machines: ['No Machine Required'],
                        power: 15,
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Test Parameters',
                                parameters: [
                                    { name: 'Test Duration', value: '30 days' },
                                    { name: 'Man Hours', value: '32 hours' },
                                    { name: 'Environment', value: 'Real-world conditions' },
                                    { name: 'Purpose', value: 'Long-term reliability' }
                                ]
                            }
                        ],
                        procedure: '1. Install mixer grinder in real-world application\n' +
                                 '2. Monitor performance for 30 days\n' +
                                 '3. Record operation under various loads\n' +
                                 '4. Document any issues or anomalies\n' +
                                 '5. Verify long-term reliability\n' +
                                 '6. Compile final test report'
                    },
                    {
                        name: 'Switch Endurance Test',
                        cycleTime: 15, // 15 hours
                        manHours: 15, // 15 hours
                        machines: ['load_bank', 'multimeter'],
                        power: 15,
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Test Parameters',
                                parameters: [
                                    { name: 'Cycles', value: '10,000' },
                                    { name: 'Load Current', value: '6A' },
                                    { name: 'Ambient Temperature', value: '37.2°C' },
                                    { name: 'Humidity', value: '67% RH' },
                                    { name: 'Test Condition', value: 'Full Load' }
                                ]
                            }
                        ],
                        procedure: '1. Connect the mixer grinder to the load bank\n' +
                                 '2. Set the load current to 6A (full load)\n' +
                                 '3. Ensure ambient conditions are 37.2°C and 67% RH\n' +
                                 '4. Start the test with the switch in ON position\n' +
                                 '5. Run the switch through 10,000 ON/OFF cycles\n' +
                                 '6. Monitor current and voltage using multimeter\n' +
                                 '7. Check for any switch failures or malfunctions\n' +
                                 '8. Verify switch operation after test completion\n' +
                                 '9. Document any issues or failures observed\n' +
                                 '10. Record all test parameters and observations'
                    }
                ],
                
                geyser: [
                    { 
                        name: 'Pressure Test', 
                        cycleTime: 2,
                        manHours: 0.33,
                        machines: ['pressure_gauge'], 
                        power: 240, 
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Spec 1',
                                parameters: [
                                    { name: 'Pressure', value: '10 bar' },
                                    { name: 'Duration', value: '2 hours' }
                                ]
                            },
                            {
                                id: 'set2',
                                name: 'Spec 2',
                                parameters: [
                                    { name: 'Pressure', value: '8 bar' },
                                    { name: 'Duration', value: '1.5 hours' }
                                ]
                            }
                        ],
                        procedure: '1. Connect pressure gauge\n2. Apply pressure gradually\n3. Maintain pressure for duration\n4. Record readings'
                    },
                    {
                        name: 'Endurance test (3500 Hours)',
                        cycleTime: 3500, // hours
                        manHours: 1100,
                        machines: ['No Machine Required'],
                        power: 240,
                        technicians: 1,
                        specificationSets: [
                          {
                            id: 'set1',
                            name: 'Standard',
                            parameters: [
                              { name: 'Product Specification', value: 'Product should be run for 10K cycles without any failure' },
                              { name: 'Capacity', value: '-' },
                              { name: 'Duration', value: '3500 Hours' }
                            ]
                          }
                        ],
                        procedure:
                          '1. Configure Geyser for endurance operation\n' +
                          '2. Run product continuously for 3500 hours\n' +
                          '3. Monitor operation and record cycle counts\n' +
                          '4. Verify product completes 10K cycles without failure\n' +
                          '5. Document all results and observations'
                      },
                    
                      {
                        name: 'Endurance test (1700 Hours)',
                        cycleTime: 1700, // hours
                        manHours: 600,
                        machines: ['No Machine Required'],
                        power: null,
                        technicians: 1,
                        specificationSets: [
                          {
                            id: 'set1',
                            name: 'Standard',
                            parameters: [
                              { name: 'Product Specification', value: 'Product should be run for 5.5K cycles without any failure' },
                              { name: 'Capacity', value: '-' },
                              { name: 'Duration', value: '1700 Hours' }
                            ]
                          }
                        ],
                        procedure:
                          '1. Configure Geyser for endurance operation\n' +
                          '2. Run product continuously for 1700 hours\n' +
                          '3. Monitor operation and record cycle counts\n' +
                          '4. Verify product completes 5.5K cycles without failure\n' +
                          '5. Document all results and observations'
                      }
                ],
                
                'Air Cooler': [
                    { 
                        name: 'Air Delivery Test', 
                        cycleTime: 1,
                        manHours: 0.5,
                        machines: ['anemometer'], 
                        power: 240, 
                        technicians: 2,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Standard',
                                parameters: [
                                    { name: 'Air Velocity', value: '0.4 - 30.0 M/S' },
                                    { name: 'Duration', value: '1 Hour' }
                                ]
                            }
                        ],
                        procedure: '1. Position anemometer at air outlet\n2. Measure air velocity at multiple points\n3. Calculate average air delivery rate\n4. Record measurements'
                    },
                    { 
                        name: 'Endurance Test (500 Hours)', 
                        cycleTime: 500,
                        manHours: 41,
                        machines: ['dimmer','clamp_meter','multimeter'], 
                        power: 240, 
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Standard',
                                parameters: [
                                    { name: 'Duration', value: '500 ON hours' },
                                    { name: 'Daily Runtime', value: '16 hours' }
                                ]
                            }
                        ],
                        procedure: '1. Run air cooler fan continuously for 16 hours daily\n2. Monitor for any failures or performance degradation\n3. Record operational parameters\n4. Complete 500 ON hours of testing'
                    },
                    { 
                        name: 'Endurance Test (1000 Hours)', 
                        cycleTime: 1000,
                        manHours: 83,
                        machines: ['dimmer','clamp_meter','multimeter'], 
                        power: 240, 
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Standard',
                                parameters: [
                                    { name: 'Duration', value: '1000 ON hours' },
                                    { name: 'Daily Runtime', value: '8 hours' }
                                ]
                            }
                        ],
                        procedure: '1. Run air cooler fan continuously for 8 hours daily\n2. Monitor for any failures or performance degradation\n3. Record operational parameters\n4. Complete 1000 ON hours of testing'
                    },
                    { 
                        name: 'Endurance Test (333 Hours)', 
                        cycleTime: 333,
                        manHours: 28,
                        machines: ['dimmer','clamp_meter','multimeter'], 
                        power: 240, 
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Standard',
                                parameters: [
                                    { name: 'Duration', value: '333 ON hours' },
                                    { name: 'Daily Runtime', value: '24 hours' }
                                ]
                            }
                        ],
                        procedure: '1. Run air cooler fan continuously for 24 hours daily\n2. Monitor for any failures or performance degradation\n3. Record operational parameters\n4. Complete 333 ON hours of testing'
                    },
                    {
                        name: 'SST',
                        cycleTime: 72,
                        manHours: 10,
                        machines: ['salt_fog_test_chamber'],
                        power: 5,
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Test Parameters',
                                parameters: [
                                    { name: 'Duration', value: '72 hours' },
                                    { name: 'Equipment', value: 'SST Machine' }
                                ]
                            }
                        ],
                        procedure: '1. Connect product to SST machine\n2. Run test for 72 hours\n3. Monitor for any failures\n4. Document all parameters and observations'
                    },
                    {
                        name: 'Application Test',
                        cycleTime: 720, // 30 days * 24 hours
                        manHours: 32,
                        machines: ['No Machine Required'],
                        power: 5,
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Test Parameters',
                                parameters: [
                                    { name: 'Duration', value: '30 days' },
                                    { name: 'Environment', value: 'Real-world conditions' },
                                    { name: 'Monitoring', value: 'Continuous' }
                                ]
                            }
                        ],
                        procedure: '1. Install air cooler in real-world application\n2. Monitor performance for 30 days\n3. Document any issues or anomalies\n4. Verify long-term reliability\n5. Compile final test report'
                    }
                ],
                ict: [
                    { 
                        name: 'Endurance Test with Voltage Variation', 
                        cycleTime: 90,
                        manHours: 30,
                        machines: ['multimeter', 'dimmer', 'power_meter'], 
                        power: 5, 
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Standard',
                                parameters: [
                                    { name: 'Voltage Range', value: '0-270V' },
                                    { name: 'Current Rating', value: '40A' },
                                    { name: 'Power Rating', value: '50VA' }
                                ]
                            }
                        ],
                        procedure: '1. Connect multimeter, dimmer and power meter\n2. Set initial voltage to minimum\n3. Gradually increase voltage while monitoring\n4. Maintain at maximum voltage for 90 hours\n5. Record all measurements hourly\n6. Check for any abnormalities',
                        notes: 'ICT run for 90 ON hours for endurance/performance test with voltage variation'
                    },
                    { 
                        name: 'Electrical Safety', 
                        cycleTime: 1.5,
                        manHours: 0.25,
                        machines: ['hi_pot_tester', 'insulation_tester'], 
                        power: 2, 
                        technicians: 1,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Spec 1',
                                parameters: [
                                    { name: 'Voltage', value: '1000V' },
                                    { name: 'Current Limit', value: '5mA' }
                                ]
                            },
                            {
                                id: 'set2',
                                name: 'Spec 2',
                                parameters: [
                                    { name: 'Voltage', value: '500V' },
                                    { name: 'Current Limit', value: '3mA' }
                                ]
                            }
                        ],
                        procedure: '1. Connect safety tester\n2. Apply test voltage\n3. Measure insulation resistance\n4. Verify safety compliance'
                    },
                    { 
                        name: 'EMC Test', 
                        cycleTime: 3,
                        manHours: 0.5,
                        machines: ['emc_chamber'], 
                        power: 4, 
                        technicians: 2,
                        specificationSets: [
                            {
                                id: 'set1',
                                name: 'Spec 1',
                                parameters: [
                                    { name: 'Frequency Range', value: '30MHz-1GHz' },
                                    { name: 'Power Level', value: '10V/m' }
                                ]
                            }
                        ],
                        procedure: '1. Place device in EMC chamber\n2. Configure frequency range\n3. Run emission tests\n4. Run immunity tests'
                    }
                ],
                inverter: [
                    {
                        name: 'Full load test',
                        cycleTime: 1, // hours
                        manHours: 1,
                        machines: ['inverter_testing_jig'],
                        power: 2.0, // 2000W = 2.0 kW
                        technicians: 1,
                        specificationSets: [
                          {
                            id: 'set1',
                            name: 'Standard',
                            parameters: [
                              {
                                name: 'Product Specification',
                                value: 'Product to be checked at rated full load at battery backup mode without going to overload or any kind of product failure till full battery discharge'
                              },
                              { name: 'Capacity', value: '2000W' },
                              { name: 'Duration', value: '1 Hour' }
                            ]
                          }
                        ],
                        procedure:
                          '1. Connect inverter with rated full load on battery backup mode\n' +
                          '2. Run until full battery discharge; ensure no overload or failures\n' +
                          '3. Record parameters and observations'
                      },
                    
                      {
                        name: 'Overload test',
                        cycleTime: 0.5, // 30 minutes
                        manHours: 0.5,
                        machines: ['inverter_testing_jig'],
                        power: 2.0, // 2000W
                        technicians: 1,
                        specificationSets: [
                          {
                            id: 'set1',
                            name: 'Standard',
                            parameters: [
                              {
                                name: 'Product Specification',
                                value: 'Product to be run at 5%, 10% increase over rated full load and overload tripping should occur'
                              },
                              { name: 'Capacity', value: '2000W' },
                              { name: 'Duration', value: '30 Minutes' }
                            ]
                          }
                        ],
                        procedure:
                          '1. Apply 105% then 110% of rated load\n' +
                          '2. Verify overload protection trips correctly\n' +
                          '3. Confirm no damage or anomalies; log results'
                      },
                    
                      {
                        name: 'Short Circuit Test',
                        cycleTime: 0.083, // ~5 minutes
                        manHours: 0.083,
                        machines: ['inverter_testing_jig'],
                        power: 2.0, // 2000W
                        technicians: 1,
                        specificationSets: [
                          {
                            id: 'set1',
                            name: 'Standard',
                            parameters: [
                              {
                                name: 'Product Specification',
                                value: 'At battery backup mode inverter output to be shorted by a short plug; no failure should be reported after removing the plug'
                              },
                              { name: 'Capacity', value: '2000W' },
                              { name: 'Duration', value: '5 Minutes' }
                            ]
                          }
                        ],
                        procedure:
                          '1. Set inverter to battery backup mode\n' +
                          '2. Momentarily short output using short plug under supervision\n' +
                          '3. Remove short; verify inverter recovers with no failure'
                      },
                    
                      {
                        name: 'Mains Back Feed Test',
                        cycleTime: 0.083, // ~5 minutes
                        manHours: 0.083,
                        machines: ['inverter_testing_jig'],
                        power: 2.0, // 2000W
                        technicians: 1,
                        specificationSets: [
                          {
                            id: 'set1',
                            name: 'Standard',
                            parameters: [
                              {
                                name: 'Product Specification',
                                value: 'Main supply to be fed at product output; no failure should be reported after correcting the connections'
                              },
                              { name: 'Capacity', value: '2000W' },
                              { name: 'Duration', value: '5 Minutes' }
                            ]
                          }
                        ],
                        procedure:
                          '1. Feed mains to inverter output (controlled test)\n' +
                          '2. Correct connections; ensure no failure or abnormality\n' +
                          '3. Document behavior and protections'
                      },
                    
                      {
                        name: 'Thermal shutdown test',
                        cycleTime: 2, // hours
                        manHours: 0.5, // 30 minutes
                        machines: ['inverter_testing_jig', 'data_acquisition_system'],
                        power: 2.1, // 2000W + 100W ≈ 2.1 kW (aggregate)
                        technicians: 1,
                        specificationSets: [
                          {
                            id: 'set1',
                            name: 'Standard',
                            parameters: [
                              {
                                name: 'Product Specification',
                                value: 'Run after removing cooling fan in battery backup mode at full load. Product should shutdown within specified temperature limits; no failure should be reported'
                              },
                              { name: 'Capacity', value: '2000W, 100W' },
                              { name: 'Duration', value: '2 Hours' }
                            ]
                          }
                        ],
                        procedure:
                          '1. Disable cooling fan; set full load on battery backup\n' +
                          '2. Monitor temperature with DAS until thermal shutdown triggers\n' +
                          '3. Verify shutdown thresholds; ensure no failure post-cooldown'
                      },
                    
                      {
                        name: 'Thermal cyclic test',
                        cycleTime: 1, // hour
                        manHours: 0.5, // 30 minutes
                        machines: ['env_chamber', 'load_bank'],
                        power: 10.4, // 8 kW + 2.4 kW
                        technicians: 1,
                        specificationSets: [
                          {
                            id: 'set1',
                            name: 'Standard',
                            parameters: [
                              {
                                name: 'Product Specification',
                                value: 'Run at 45°C & RH 40% at max discharging current 66A and 52°C RH 50% at 80% of max discharging current (≈52.8A) without failure until battery discharge'
                              },
                              { name: 'Capacity', value: '8 kW, 2400 W' },
                              { name: 'Duration', value: '1 Hour (per cycle window)' }
                            ]
                          }
                        ],
                        procedure:
                          '1. Set chamber: 45°C/40% RH, then 52°C/50% RH per profile\n' +
                          '2. Apply currents (66A and ~52.8A) with load bank\n' +
                          '3. Cycle conditions until battery discharge; log results'
                      },
                    
                      {
                        name: 'Relay switching test',
                        cycleTime: 160, // hours
                        manHours: 32,
                        machines: ['load_bank'],
                        power: 2.4, // 2400W
                        technicians: 1,
                        specificationSets: [
                          {
                            id: 'set1',
                            name: 'Standard',
                            parameters: [
                              {
                                name: 'Product Specification',
                                value: 'Run for 3000 cycles (60 s mains mode + 60 s backup mode) at max discharging current 66A without any failure'
                              },
                              { name: 'Capacity', value: '2400W' },
                              { name: 'Duration', value: '160 Hours' }
                            ]
                          }
                        ],
                        procedure:
                          '1. Cycle between mains and backup every 60 seconds\n' +
                          '2. Maintain 66A discharging current; monitor relay operations\n' +
                          '3. Complete 3000 cycles without failure; document results'
                      },
                    
                      {
                        name: 'High Voltage Test',
                        cycleTime: 0.25, // 15 minutes
                        manHours: 0.25,
                        machines: ['high_voltage_tester'],
                        power: 0.6,
                        technicians: 1,
                        specificationSets: [
                          {
                            id: 'set1',
                            name: 'Standard',
                            parameters: [
                              { name: 'Product Specification', value: 'High-voltage test at 1.5 kV for 60 seconds' },
                              { name: 'Capacity', value: '-' },
                              { name: 'Duration', value: '15 Minutes' }
                            ]
                          }
                        ],
                        procedure:
                          '1. Set HV panel to 1.5 kV\n' +
                          '2. Apply for 60 seconds per safety SOP; monitor leakage\n' +
                          '3. Ensure insulation withstands; record measurements'
                      },
                    
                      {
                        name: 'Application test',
                        cycleTime: 60, // duration given as cycles only
                        manHours: 30,
                        machines: ['No Machine Required'],
                        power: 5,
                        technicians: 1,
                        specificationSets: [
                          {
                            id: 'set1',
                            name: 'Standard',
                            parameters: [
                              { name: 'Product Specification', value: '-' },
                              { name: 'Capacity', value: '-' },
                              { name: 'Duration', value: '30 cycles' }
                            ]
                          }
                        ],
                        procedure:
                          '1. Execute 30 application-specific cycles per SOP\n' +
                          '2. Monitor operation and protections\n' +
                          '3. Record parameters and observations'
                      },
                    
                      {
                        name: 'SST',
                        cycleTime: 72,
                        manHours: 10,
                        machines: ['salt_fog_test_chamber'],
                        power: 5,
                        technicians: 1,
                        specificationSets: [
                          {
                            id: 'set1',
                            name: 'Test Parameters',
                            parameters: [
                              { name: 'Duration', value: '72 hours' },
                              { name: 'Equipment', value: 'SST Machine' }
                            ]
                          }
                        ],
                        procedure:
                          '1. Connect product to SST machine\n' +
                          '2. Run test for 72 hours\n' +
                          '3. Monitor for any failures\n' +
                          '4. Document all parameters and observations'                    }
                ],
                
'Modular Switches': [
                    {
                        name: 'Resistance to Ageing',
                        cycleTime: 168, // 7 days
                        manHours: 6,
                        machines: ['hot_air_oven','env_chamber'],
                        power: 0.84,
                        technicians: 1,
                        specificationSets: [{
                            id: 'ms_ageing',
                            name: 'Ageing sequence',
                            parameters: [
                                { name: 'Oven Temp', value: '70±2', unit: '°C' },
                                { name: 'Oven Duration', value: '7', unit: 'days (168 h)' },
                            ]
                        }],
                        procedure: '1) Keep switches in oven at 70±2°C for 7 days.\n'+
                                '2) Move for Resistance to Humidity test.'
                        
                    },
                    {
                        name: 'Resistance to Humidity',
                        cycleTime: 144, manHours: 5, technicians: 1, power: 8,
                        machines: ['env_chamber'],
                        specificationSets: [{
                            id: 'ms_humidity',
                            name: 'Humidity',
                            parameters: [
                                { name: 'RH (Room Hold)', value: '45–55', unit: '% RH' },
                                { name: 'Humidity Soak', value: '90–95', unit: '% RH' },
                                { name: 'Humidity Duration', value: '4', unit: 'days (96 h)' },
                                { name: 'Result', value: 'No cracks / not sticky or greasy' }
                            ]
                        }],
                        procedure:
                        '1) Move to humidity cabinet at room temp (45–55% RH), then 6 days at 90–95% RH.\n' +
                        '2) Inspect: no crack, not sticky/greasy.'

                            },
                    {
                        name: 'LED Load Test (CL 19.3) — 10A',
                        cycleTime: 23,
                        manHours: 2,
                        machines: ['endurance_test_panel', 'load_bank', 'fixture_stand_for_switches'],
                        power: 15.12,
                        technicians: 1,
                        specificationSets: [{
                            id: 'ms10a_led',
                            name: '10A — LED load',
                            parameters: [
                                { name: 'Pre TR Test', value: '13.5', unit: 'A for 1 h (≤45°C)' },
                                { name: 'Cycles', value: '20,000', unit: '1s ON / 3s OFF' },
                                { name: 'Load', value: '100', unit: 'W LED' },
                                { name: 'Peak Current', value: '108', unit: 'A' },
                                { name: 'HV Test', value: '1.5', unit: 'kV for 60 s' },
                                { name: 'Post TR Test', value: '10', unit: 'A for 1 h (≤45°C)' }
                            ]
                        }],
                        procedure: '1) TR test @13.5A for 1 h (≤45°C).\n' +
                                 '2) Run 20,000 cycles at 100 W (1s ON/3s OFF). Peak current ≈108A.\n' +
                                 '3) HV test 1.5 kV/60 s.\n' +
                                 '4) TR test @10A for 1 h (≤45°C).'
                    },
                    {
                        name: 'LED Load Test (CL 19.3) — 20A',
                        cycleTime: 6,            // hours
                        manHours: 1,
                        technicians: 1,
                        power: 15.12,
                        machines: ['endurance_test_panel', 'load_bank', 'fixture_stand_for_switches'],
                        specificationSets: [{
                          id: 'ms20a_led',
                          name: '20A — LED load',
                          parameters: [
                            { name: 'Pre TR Test', value: '25', unit: 'A for 1 h (≤45°C)' },
                            { name: 'Cycles', value: '5,000', unit: '2s ON / 6s OFF' },
                            { name: 'Load', value: '250', unit: 'W LED' },
                            { name: 'Peak Current', value: '192', unit: 'A' },
                            { name: 'HV Test', value: '1.5', unit: 'kV for 60 s' },
                            { name: 'Post TR Test', value: '20', unit: 'A for 1 h (≤45°C)' }
                          ]
                        }],
                        procedure:
                      `1) TR test @25A for 1 h (≤45°C).
                      2) 5,000 cycles at 250 W (2s ON / 6s OFF), peak ≈192A.
                      3) HV test 1.5 kV for 60 s.
                      4) TR test @20A for 1 h (≤45°C).`
                      },
                    {
                        name: 'Making & Breaking (CL 18.2) - 10A',
                        cycleTime: 0.333,
                        manHours: 0.333,
                        machines: ['endurance_test_panel','load_bank','fixture_stand_for_switches'],
                        power: 15.12,
                        technicians: 1,
                        specificationSets: [{
                            id: 'ms10a_mnb',
                            name: '10A — M&B',
                            parameters: [
                                { name: 'Cycles', value: '100' },
                                { name: 'Duty', value: '2s ON / 2s OFF' },
                                { name: 'Current', value: '1.25 × rated' },
                                { name: 'Voltage', value: '1.1 × rated' }
                            ]
                        }],
                        procedure: 'Run 100 cycles, 2s ON/2s OFF, at 1.25×Irated and 1.1×Vrated. Verify no failure.'
                    },
                    {
                        name: 'Making & Breaking (CL 18.2) — 16A',
                        cycleTime: 0.333,               
                        manHours: 0.333,
                        technicians: 1,
                        power: 15.12,
                        machines: ['endurance_test_panel', 'load_bank', 'Fixture Stand for sockets'],
                        specificationSets: [{
                          id: 'ms16a_mnb',
                          name: '16A — Making & Breaking',
                          parameters: [
                            { name: 'Cycles', value: '100' },
                            { name: 'Duty', value: '1.5s ON / 2.5s OFF' },
                            { name: 'Current', value: '1.25 × rated' },
                            { name: 'Voltage', value: '1.1 × rated' }
                          ]
                        }],
                        procedure:
                      `Run 100 cycles, 1.5s ON / 2.5s OFF at 1.25×Irated and 1.1×Vrated. Verify no failure.`
                      },
                      {
                        name: 'Filament Lamp Load (CL 18.3) — 10A',
                        cycleTime: 0.333, manHours: 0.333, technicians: 1, power: 7.68,
                        machines: ['endurance_test_panel', 'load_bank', 'fixture_stand_for_switches'],
                        specificationSets: [{
                          id: 'ms10a_filament',
                          name: '10A — Filament load',
                          parameters: [
                            { name: 'Cycles', value: '100' },
                            { name: 'Duty', value: '2s ON / 2s OFF' },
                            { name: 'Current/Voltage', value: '1.2 × rated' }
                          ]
                        }],
                        procedure:
                    `Run 100 cycles with filament lamp load at 1.2×Irated and 1.2×Vrated, 2s ON/2s OFF.`
                      },
                      {
                        name: 'Endurance - 10A',
                        cycleTime: 23, manHours: 2, technicians: 1, power: 15.12,
                        machines: ['endurance_test_panel', 'load_bank', 'fixture_stand_for_switches'],
                        specificationSets: [{
                          id: 'ms10a_endurance',
                          name: '10A — Endurance',
                          parameters: [
                            { name: 'Pre TR Test', value: '13.5', unit: 'A for 1 h (≤45°C)' },
                            { name: 'Cycles', value: '20,000', unit: '1s ON / 3s OFF' },
                            { name: 'Voltage/Current', value: 'Rated' },
                            { name: 'HV Test', value: '1.5', unit: 'kV for 60 s' },
                            { name: 'IR', value: '≥ 2', unit: 'MΩ (T–T, T–Body)' },
                            { name: 'Post TR Test', value: '10', unit: 'A for 1 h (≤45°C)' }
                          ]
                        }],
                        procedure:
                    `1) TR test @13.5A for 1 h.
                    2) 20,000 cycles @ rated V/I (1s ON/3s OFF).
                    3) HV 1.5 kV/60 s & IR ≥2 MΩ (terminal–terminal & terminal–body).
                    4) TR test @10A for 1 h (≤45°C).`
                      },
                      {
                        name: 'Endurance — 16A',
                        cycleTime: 6,                   // hours
                        manHours: 1,                    // person time
                        technicians: 1,
                        power: 15.12,
                        machines: ['endurance_test_panel', 'load_bank', 'Fixture Stand for sockets'],
                        specificationSets: [{
                          id: 'ms16a_endurance',
                          name: '16A — Endurance',
                          parameters: [
                            { name: 'Pre TR Test', value: '22', unit: 'A for 1 h (≤45°C)' },
                            { name: 'Cycles', value: '5,000', unit: '1.5s ON / 2.5s OFF' },
                            { name: 'Voltage/Current', value: 'Rated' },
                            { name: 'HV Test', value: '1.5', unit: 'kV for 60 s' },
                            { name: 'IR', value: '≥ 2', unit: 'MΩ' },
                            { name: 'Post TR Test', value: '16', unit: 'A for 1 h (≤45°C)' }
                          ]
                        }],
                        procedure:
                      `1) TR @22A for 1 h (≤45°C).
                      2) 5,000 cycles at rated V/I (1.5s ON / 2.5s OFF).
                      3) HV 1.5 kV for 60 s; IR ≥2 MΩ.
                      4) TR @16A for 1 h (≤45°C).`
                      },
                      {
                        name: 'Fluorescent Load (CL 19.2)',
                        cycleTime: 6, manHours: 1, technicians: 1, power: 15.12,
                        machines: ['endurance_test_panel', 'load_bank'],
                        specificationSets: [{
                          id: 'ms_fluoro',
                          name: 'Fluorescent load',
                          parameters: [
                            { name: 'Pre TR Test', value: '13.5', unit: 'A for 1 h (≤45°C)' },
                            { name: 'Load A', value: '5,000', unit: 'cycles (1s ON/3s OFF)' },
                            { name: 'Load B', value: '50', unit: 'cycles' },
                            { name: 'HV Test', value: '1.5', unit: 'kV for 60 s' },
                            { name: 'IR', value: '≥ 2', unit: 'MΩ' },
                            { name: 'Post TR Test', value: '10', unit: 'A for 1 h (≤45°C)' }
                          ]
                        }],
                        procedure:
                    `TR @13.5A/1 h → 5,000 cycles (Load A) + 50 cycles (Load B) → HV 1.5 kV/60 s, IR ≥2 MΩ → TR @10A/1 h.`
                      },
                      {
                        name: 'Electric Strength',
                        cycleTime: 0.25, manHours: 0.25, technicians: 1, power: 5.6,
                        machines: ['high_voltage_tester'],
                        specificationSets: [{
                          id: 'ms_est',
                          name: 'Electric Strength',
                          parameters: [
                            { name: 'HV Test', value: '2', unit: 'kV for 60 s' }
                          ]
                        }],
                        procedure: `Apply 2 kV for 60 s after cycling tests; no breakdown permitted.`
                      },
                      {
                        name: 'Glow Wire',
                        cycleTime: 0.5, manHours: 0.5, technicians: 1, power: 0,
                        machines: ['glow_wire_test_apparatus'],
                        specificationSets: [{
                          id: 'ms_gw',
                          name: 'Glow Wire (850°C)',
                          parameters: [
                            { name: 'Temperature', value: '850', unit: '°C' },
                            { name: 'Pass Criteria', value: 'No sustained flame/glow; extinguish ≤30 s; no ignition of tissue/scorching of board' }
                          ]
                        }],
                        procedure:
                    `Test insulating parts at 850°C:
                    • No visible sustained flame/glow, or it must extinguish ≤30 s after removal.
                    • No ignition of wrapping tissue or board scorching.`
                      },
                      {
                        name: 'Max/Min Withdrawal Force — 16A',
                        cycleTime: 0.167,               // ~10 minutes
                        manHours: 0.167,
                        technicians: 1,
                        power: 0,
                        machines: ['maximum_minimum_withdrawal_force_apparatus'],
                        specificationSets: [{
                          id: 'ms16a_withdrawal',
                          name: '16A — Withdrawal force',
                          parameters: [
                            { name: 'Gauge Force', value: '1N / 20N / 40N' },
                            { name: 'Hold Time', value: '≥ 30', unit: 's (no fall)' }
                          ]
                        }],
                        procedure:
                      `Hang socket face-down; insert gauge in each hole.
                      Gauge must remain ≥30 s without falling (spec 1N, 20N, 40N).`
                      },
                      {
                        name: 'Ball Pressure — 16A',
                        cycleTime: 1,                   // 1 hour duration
                        manHours: 0.333,                // ~20 minutes of person time
                        technicians: 1,
                        power: 0.84,
                        machines: ['hot_air_oven'],
                        specificationSets: [{
                          id: 'ms16a_ball_pressure',
                          name: '16A — Ball Pressure',
                          parameters: [
                            { name: 'Oven Temp', value: '125', unit: '°C' },
                            { name: 'Duration', value: '1', unit: 'h' }
                          ]
                        }],
                        procedure: `Keep socket in oven at 125°C for 1 h; evaluate imprint as per method.`
                      }
                ]
            };
        }}
        /**
         * Reassigns tests from one set of technicians to another
         * @param {Array} fromTechs - Array of technicians to reassign from
         * @param {Array} toTechs - Array of technicians to reassign to
         */
        function reassignTestsBetweenShifts(fromTechs, toTechs) {
            if (toTechs.length === 0) return;
            
            fromTechs.forEach(fromTech => {
                if (!fromTech.assignedTests || fromTech.assignedTests.length === 0) return;
                
                // Get active tests assigned to this technician
                const testsToReassign = [];
                fromTech.assignedTests.forEach(testId => {
                    const test = labData.activeTests.find(t => t.sampleId === testId || t.id === testId);
                    if (test && getRemainingTestHours(test) > 0) {
                        testsToReassign.push(test);
                    }
                });
                
                // Sort tests by remaining time (longest first)
                testsToReassign.sort((a, b) => 
                    getRemainingTestHours(b) - getRemainingTestHours(a)
                );
                
                // Reassign each test
                testsToReassign.forEach(test => {
                    // Find least busy technician in the next shift
                    const nextTech = [...toTechs].sort((a, b) => 
                        (a.currentWorkload || 0) - (b.currentWorkload || 0)
                    )[0];
                    
                    if (nextTech) {
                        // Remove from current technician
                        fromTech.assignedTests = fromTech.assignedTests.filter(id => 
                            id !== test.sampleId && id !== test.id
                        );
                        
                        // Add to next technician
                        if (!nextTech.assignedTests.includes(test.sampleId)) {
                            nextTech.assignedTests.push(test.sampleId || test.id);
                            
                            // Update workload for the next shift
                            const remainingManHours = getRemainingManHours(test);
                            const shiftRemaining = getShiftRemainingTime(getCurrentShift());
                            const workInThisShift = Math.min(remainingManHours, shiftRemaining);
                            
                            nextTech.currentWorkload = (nextTech.currentWorkload || 0) + workInThisShift;
                            
                            // Update test's technician reference if it exists
                            if (test.technician) {
                                test.technician = nextTech.name;
                            }
                            
                            console.log(`Reassigned test ${test.sampleId || test.id} from ${fromTech.name} to ${nextTech.name}`);
                        }
                    }
                });
                
                // Reset workload for the technician whose shift ended
                fromTech.currentWorkload = 0;
            });
        }
        
        /**
         * Checks for tests that need reassignment due to shift changes
         */
        function checkForShiftChangeReassignment() {
            const currentShifts = getCurrentShift();
            const nextShift = getNextShift();
            
            // Handle each current shift separately
            currentShifts.forEach(currentShift => {
                // Get technicians for current and next shifts
                const currentTechs = getAvailableTechniciansInShift(currentShift);
                const nextTechs = getAvailableTechniciansInShift(nextShift);
                
                // Only proceed if we have technicians in the next shift
                if (nextTechs.length === 0) return;
                
                // Get technicians whose shift is ending
                const endingShiftTechs = labData.technicians.filter(tech => {
                    const techShift = tech.shift || 'shiftA';
                    
                    // Skip if no tests assigned or if tech is in multiple shifts
                    if (!tech.assignedTests?.length) return false;
                    
                    // For General Shift, only reassign at 5:30 PM when it ends
                    if (techShift === 'shiftG') {
                        const now = new Date();
                        const currentHour = now.getHours() + (now.getMinutes() / 60);
                        return currentHour >= 17.5; // 5:30 PM
                    }
                    
                    // For other shifts, check if their shift is ending
                    return techShift === currentShift && 
                           nextShift !== currentShift; // Only if shifts are different
                });
                
                if (endingShiftTechs.length > 0) {
                    console.log(`Reassigning tests from ${endingShiftTechs.length} technicians in ending shift ${currentShift}`);
                    reassignTestsBetweenShifts(endingShiftTechs, nextTechs);
                }
            });
            
            // Schedule next check (every 5 minutes)
            setTimeout(checkForShiftChangeReassignment, 5 * 60 * 1000);
        }
        
        // Helper functions
        function getProductId(sampleId) {
            const parts = sampleId.split('-');
            return parts.slice(0, -1).join('-');
        }
        
        function getSKUId(sampleId) {
            const parts = sampleId.split('-');
            return parts.slice(0, -1).join('-');
        }
        
        function formatDateTime(date) {
            try {
                return new Intl.DateTimeFormat('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }).format(new Date(date));
            } catch (error) {
                console.error('Date formatting error:', error);
                return 'Invalid Date';
            }
        }
        
        
        function showAlert(message, type) {
            try {
                // Skip verbose initialization messages
                
                
                const existingAlert = document.querySelector('.alert');
                if (existingAlert) {
                    existingAlert.remove();
                }
                
                const alert = document.createElement('div');
                alert.className = `alert ${type}`;
                alert.innerHTML = `
                    <span style="font-size: 1.5rem;">
                        ${type === 'error' ? '❌' : type === 'warning' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'}
                    </span>
                    <span>${message}</span>
                `;
                
                const header = document.querySelector('.header');
                if (header) {
                    header.after(alert);
                }
                
                setTimeout(() => {
                    if (alert.parentNode) {
                        alert.remove();
                    }
                }, 5000);
            } catch (error) {
                console.error('Alert display error:', error);
            }
        }
        
        function calculateTestProgress(test) {
            try {
                const now = new Date();
                const start = new Date(test.startTime);
                const end = new Date(test.estimatedCompletion);
                
                const totalTime = end - start;
                const elapsedTime = now - start;
                
                return Math.min(Math.max((elapsedTime / totalTime) * 100, 0), 100);
            } catch (error) {
                console.error('Test progress calculation error:', error);
                return 0;
            }
        }
        
        function getRemainingTestHours(test) {
            const now = new Date();
            const estimatedCompletion = new Date(test.estimatedCompletion);
            const remainingMilliseconds = estimatedCompletion - now;
            return Math.max(0, remainingMilliseconds / (1000 * 60 * 60));
        }
        
        function getHoursRemainingInDay(date) {
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            const hoursRemaining = (endOfDay - date) / (1000 * 60 * 60);
            return Math.max(0, hoursRemaining);
        }
        
        function getActiveProducts() {
            try {
                const activeProductIds = new Set();
                labData.activeTests.forEach(test => {
                    const productId = getProductId(test.sampleId);
                    activeProductIds.add(productId);
                });
                return Array.from(activeProductIds);
            } catch (error) {
                console.error('Active products calculation error:', error);
                return [];
            }
        }
        
        function calculateMachineUtilization() {
            try {
              const now = new Date();
              const hoursRemainingToday = getHoursRemainingInDay(now);
          
              if (labData.machines.length === 0 || hoursRemainingToday === 0) {
                return 0;
              }
          
              let totalUtilization = 0;
              let machineCount = 0;
          
              labData.machines.forEach(machine => {
                let machineBusyHours = 0;
          
                // Build today’s schedule for this machine
                (labData.activeTests || []).forEach(test => {
                  if (test.assignedMachines && test.assignedMachines.includes(machine.id)) {
                    const remainingTestHours = getRemainingTestHours(test);
                    if (remainingTestHours > 0) {
                      const hoursInToday = Math.min(remainingTestHours, hoursRemainingToday);
                      machineBusyHours += hoursInToday;
                    }
                  }
                });
          
                // Cap at the remaining hours today
                machineBusyHours = Math.min(machineBusyHours, hoursRemainingToday);
          
                const utilization = (machineBusyHours / hoursRemainingToday) * 100;
                totalUtilization += Math.min(utilization, 100);
                machineCount++;
              });
          
              return machineCount > 0 ? totalUtilization / machineCount : 0;
            } catch (error) {
              console.error('Machine utilization calculation error:', error);
              return 0;
            }
          }
          
          
        
        // FIXED: Calculate machine queues with exact product count
        function calculateMachineQueues(additionalRequirements = {}) {
            try {
              const machineQueues = {};
          
              // Group machines by type
              const machinesByType = {};
              labData.machines.forEach(machine => {
                if (!machinesByType[machine.type]) machinesByType[machine.type] = [];
                machinesByType[machine.type].push(machine);
              });
          
              // Calculate current state for each machine type
              Object.keys(machinesByType).forEach(machineType => {
                const machines = machinesByType[machineType];
          
                // --- ACTIVE: count how many machines of this TYPE are currently occupied (0..machines.length) ---
                const activeMachinesOfThisType = new Set();
                (labData.activeTests || []).forEach(test => {
                  (machines || []).forEach(m => {
                    if (test.assignedMachines && test.assignedMachines.includes(m.id)) {
                      activeMachinesOfThisType.add(m.id);
                    }
                  });
                });
                const activeTests = activeMachinesOfThisType.size; // number of occupied machines for this TYPE
          
                // --- PENDING: only count the NEXT required step per sample for this TYPE ---
                let pendingTests = 0;
                (labData.testQueue || []).forEach(request => {
                  (request.samples || []).forEach(sample => {
                    if (sample?.status === 'pending' && (sample.tests?.length || 0) > 0) {
                      const j = sample.currentTest;
                      const currentTestConfig = sample.testConfigs?.[j];
                      if (currentTestConfig && Array.isArray(currentTestConfig.machines)
                          && currentTestConfig.machines.includes(machineType)) {
                        pendingTests += 1; // count the sample once for this TYPE
                      }
                    }
                  });
                });
          
                // Additional preview requirements (if any)
                const additionalTests = additionalRequirements[machineType] || 0;
          
                // --- Queue math: how many beyond available machines need to wait ---
                const totalDemand = activeTests + pendingTests + additionalTests;
                const capacity = machines.length;
                const waiting = Math.max(0, totalDemand - capacity);           // total items that cannot start now
                const queuePerMachine = Math.ceil(waiting / Math.max(1, capacity)); // average wait per machine
          
                machineQueues[machineType] = {
                  machines,
                  currentActive: activeTests,
                  currentPending: pendingTests,
                  additionalTests,
                  totalTests: totalDemand,
                  queuePerMachine,
                  isOverloaded: queuePerMachine > 2
                };
              });
          
              return machineQueues;
            } catch (error) {
              console.error('Machine queue calculation error:', error);
              return {};
            }
          }
          
        
        // Refresh test dropdown after result submission
        function refreshTestDropdown() {
            try {
                const select = document.getElementById('testToUpdate');
                if (select) {
                    select.innerHTML = '<option value="">Select a test to update</option>';
                    
                    labData.activeTests.forEach(test => {
                        const option = document.createElement('option');
                        option.value = test.sampleId + '|' + test.test;
                        option.textContent = `${test.sampleId} - ${test.test} (${test.testType || 'N/A'})`;
                        select.appendChild(option);
                    });
                }
            } catch (error) {
                console.error('Test dropdown refresh error:', error);
            }
        }
        
        // Check and reset timeline daily
        function checkTimelineReset() {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            
            if (!labData.timelineLastReset) {
                labData.timelineLastReset = today;
            } else {
                const lastReset = new Date(labData.timelineLastReset);
                const lastResetDay = new Date(lastReset.getFullYear(), lastReset.getMonth(), lastReset.getDate());
                
                if (today > lastResetDay) {
                    // Reset timeline for new day
                    labData.completedTests = labData.completedTests.filter(test => {
                        const testDate = new Date(test.completedAt);
                        const testDay = new Date(testDate.getFullYear(), testDate.getMonth(), testDate.getDate());
                        return testDay.getTime() === today.getTime();
                    });
                    
                    labData.timelineLastReset = today;
                    updateTimeline();
                }
            }
        }
        
        // Update shift indicator to handle multiple active shifts with separate remaining times
        function updateShiftIndicator() {
            try {
                const currentShifts = getCurrentShift();
                
                const shiftEl = document.getElementById('currentShift');
                const remainingEl = document.getElementById('shiftTimeRemaining');
                
                if (shiftEl) {
                    // Create an array of shift names with their remaining times
                    const shiftInfo = currentShifts.map(shift => {
                        const shiftName = labData.shiftSchedule[shift]?.name || shift;
                        const remaining = getShiftRemainingTime(shift);
                        const hours = Math.floor(remaining);
                        const minutes = Math.round((remaining - hours) * 60);
                        return {
                            name: shiftName,
                            time: `${hours}h ${minutes}m`
                        };
                    });
                    
                    // Display shift names
                    const shiftNames = shiftInfo.map(info => info.name).join(' + ');
                    shiftEl.textContent = shiftNames || 'No active shift';
                    
                    // Display remaining times for each shift
                    if (remainingEl) {
                        const timeText = shiftInfo.length > 0 
                            ? shiftInfo.map(info => `${info.name}: ${info.time}`).join(' | ')
                            : '-';
                        remainingEl.textContent = timeText;
                    }
                }
                
                // Check if shift change is needed (compare with first active shift)
                const lastShift = localStorage.getItem('lastShift');
                const primaryShift = currentShifts[0] || '';
                
                if (!lastShift) {
                    // First time - set current shift
                    localStorage.setItem('lastShift', primaryShift);
                } else if (lastShift !== primaryShift) {
                    // Primary shift has changed - handle handover
                    console.log(`Detected primary shift change: ${lastShift} → ${primaryShift}`);
                    handleShiftChange();
                    localStorage.setItem('lastShift', primaryShift);
                    
                    // Update the technician table to reflect shift changes
                    updateTechnicianTable();
                }
                
            } catch (error) {
                console.error('Shift indicator update error:', error);
            }
        }
        
        function updateTimeline() {
            try {
              const container = document.getElementById('testingTimeline');
              if (!container) return;
          
              // Start fresh
              container.innerHTML = '';
          
              // Build an array from live data
              const allTests = [];
          
              // 1) Add ACTUAL running tests first
              const active = Array.isArray(labData.activeTests) ? labData.activeTests : [];
              active.forEach(t => {
                // Normalize fields so timeline shows proper labels
                const hours = (t.durationHours ?? t.cycleTime ?? t.manHours ?? 0);
                const start = t.startTime ? new Date(t.startTime) : new Date();
                const eta = hours ? new Date(start.getTime() + hours * 3600 * 1000) : undefined;
          
                allTests.push({
                  test: t.test,
                  sampleId: t.sampleId || t.modelName || '',
                  status: 'in-progress',
                  technician: (t.technician || t.assignedTechnician || t.assignee || 'Not Assigned'),
                  machines: (t.assignedMachineNames?.length ? t.assignedMachineNames : (t.machines?.length ? t.machines : ['No Machine Required'])),
                  startTime: start,
                  estimatedCompletion: eta,
                  duration: hours,
                  productType: t.productType || t.productClass || 'Unknown Product'
                });
              });
          
              // Keep a set of (sampleId__test) that are actually running, so we don't double-show from queue
              const activeKeys = new Set(active.map(t => `${t.sampleId || t.modelName || ''}__${t.test}`));
          
              // 2) Add QUEUE “current” tests only (skip if already active)
              const queue = Array.isArray(labData.testQueue) ? labData.testQueue : [];
              queue.forEach(request => {
                const productType = request.productType || 'Unknown Product';
                (request.samples || []).forEach(sample => {
                  const tests = sample.tests || [];
                  const idx = sample.currentTest ?? 0;
          
                  tests.forEach((testName, index) => {
                    // only CURRENT test can be in-progress; others should remain pending (and we’ll filter them out later)
                    const isCurrent = index === idx;
                    const testConfig = sample.testConfigs?.[index] || {};
                    const hours = (testConfig.durationHours ?? testConfig.cycleTime ?? 0);
          
                    const testObj = {
                      test: testName,
                      sampleId: sample.id,
                      status: isCurrent ? (sample.status || 'pending') : 'pending',
                      technician: (sample.assignedTo || sample.technician || 'Not Assigned'),
                      machines: (testConfig.machines?.length ? testConfig.machines : ['No Machine Required']),
                      startTime: isCurrent ? (sample.startTime || sample.startedAt || null) : null,
                      duration: hours,
                      productType,
                      testConfig
                    };
          
                    if (isCurrent && testObj.status === 'in-progress' && hours) {
                      const st = testObj.startTime ? new Date(testObj.startTime) : new Date();
                      testObj.estimatedCompletion = new Date(st.getTime() + hours * 3600 * 1000);
                    }
          
                    const key = `${testObj.sampleId}__${testObj.test}`;
                    if (!activeKeys.has(key)) {
                      allTests.push(testObj);
                    }
                  });
                });
              });
          
              // 3) Show ONLY currently running items (clean timeline)
              const running = allTests.filter(t => t.status === 'in-progress');
          
              // 4) Render (limit to 20 for compactness)
              running.slice(0, 20).forEach(test => {
                const badgeCls = 'timeline-badge in-progress';
                const timeLabel = (() => {
                  if (test.estimatedCompletion) {
                    const remainingH = Math.max(0, (test.estimatedCompletion - new Date()) / 36e5);
                    return `Remaining: ~${Math.ceil(remainingH)}h`;
                  }
                  if (test.duration) return `Duration: ${test.duration}h`;
                  return 'Not scheduled';
                })();
          
                const machines = Array.isArray(test.machines) ? test.machines.join(', ') : String(test.machines || '');
                const title = `${test.sampleId ? test.sampleId + ' - ' : ''}${test.test}`;
          
                const item = document.createElement('div');
                item.className = 'timeline-item in-progress';
                item.innerHTML = `
                  <div class="timeline-header">
                    <span class="timeline-badge in-progress">in-progress</span>
                    <div class="timeline-title">${title}</div>
                  </div>
                  <div class="timeline-info">
                    <span><span class="timeline-info-label">Product:</span><span class="timeline-info-value">${test.productType || '-'}</span></span>
                    <span><span class="timeline-info-label">Tech:</span><span class="timeline-info-value">${test.technician || 'Not Assigned'}</span></span>
                    <span><span class="timeline-info-label">Machine:</span><span class="timeline-info-value">${machines || 'No Machine Required'}</span></span>
                    <span><span class="timeline-info-label">Time:</span><span class="timeline-info-value">${timeLabel}</span></span>
                  </div>
                `;
                container.appendChild(item);
              });
          
              // If none are running, show a gentle empty state
              if (running.length === 0) {
                container.innerHTML = `<div style="padding:10px;color:#999">No tests are currently running.</div>`;
              }
            } catch (e) {
              console.error('Timeline update error:', e);
            }
          }
          
        
        // Enhanced Active Tests Display with Better Organization
        function updateActiveTestsTable() {
            try {
                const container = document.getElementById('activeTestsContainer');
                if (!container) return;
                dedupeActiveTests();
                
                container.innerHTML = '';
                
                if (labData.activeTests.length === 0) {
                    container.innerHTML = '<p style="color: #888; text-align: center;">No active tests at the moment</p>';
                    return;
                }
                
                labData.activeTests.forEach(test => {
                    const request = labData.testQueue.find(r => r.id === test.requestId);
                    const sample = request?.samples.find(s => s.id === test.sampleId);
                    
                    if (request && sample) {
                        const progress = calculateTestProgress(test);
                        
                        const testCard = document.createElement('div');
                        testCard.className = 'active-test-card';
                        testCard.innerHTML = `
                            <div class="active-test-header">
                                <span class="active-test-title">${test.sampleId}</span>
                                <span class="status in-progress">IN PROGRESS</span>
                            </div>
                            <div class="active-test-details">
                                <div class="active-test-detail">
                                    <div class="active-test-detail-label">Product</div>
                                    <div class="active-test-detail-value">${request.productType.toUpperCase()}</div>
                                </div>
                                <div class="active-test-detail">
                                    <div class="active-test-detail-label">Model</div>
                                    <div class="active-test-detail-value">${sample.modelName || 'N/A'}</div>
                                </div>
                                <div class="active-test-detail">
                                    <div class="active-test-detail-label">Current Test</div>
                                    <div class="active-test-detail-value">${test.test}</div>
                                </div>
                                <div class="active-test-detail">
                                    <div class="active-test-detail-label">Classification</div>
                                    <div class="active-test-detail-value">${request.productClass}</div>
                                </div>
                                <div class="active-test-detail">
                                    <div class="active-test-detail-label">Test Type</div>
                                    <div class="active-test-detail-value">${request.testType || 'N/A'}</div>
                                </div>
                                <div class="active-test-detail">
                                    <div class="active-test-detail-label">Technician</div>
                                    <div class="active-test-detail-value">${test.technician}</div>
                                </div>
                            </div>
                            <div class="timeline-progress" style="margin-top: 15px;">
                                <div class="timeline-progress-bar">
                                    <div class="timeline-progress-fill" style="width: ${progress}%"></div>
                                </div>
                                <div class="timeline-progress-text">
                                    Progress: ${progress.toFixed(0)}% - Est. Completion: ${formatDateTime(test.estimatedCompletion)}
                                </div>
                            </div>
                        `;
                        
                        container.appendChild(testCard);
                    }
                });
            } catch (error) {
                console.error('Active tests table update error:', error);
            }
        }
        
        // Generate SKU names input fields
        function generateSKUNamesInput() {
            try {
                const container = document.getElementById('skuNamesContainer');
                if (!container || !currentRequest) return;
                
                container.innerHTML = '';
                
                for (let sku = 1; sku <= currentRequest.numSKUs; sku++) {
                    const skuDiv = document.createElement('div');
                    skuDiv.className = 'sku-name-input';
                    skuDiv.innerHTML = `
                        <label>Model Name for SKU ${sku}</label>
                        <input type="text" id="skuName-${sku}" placeholder="Enter model name (e.g., VG-2000XL)">
                    `;
                    container.appendChild(skuDiv);
                }
            } catch (error) {
                console.error('SKU names input generation error:', error);
            }
        }
        
        // Confirm SKU names and proceed to test configuration
        function confirmSKUNames() {
            try {
                if (!currentRequest) return;
                
                // Collect and validate SKU names
                const skuNames = {};
                for (let sku = 1; sku <= currentRequest.numSKUs; sku++) {
                    const nameInput = document.getElementById(`skuName-${sku}`);
                    if (!nameInput || !nameInput.value.trim()) {
                        showAlert(`Please enter model name for SKU ${sku}`, 'warning');
                        return;
                    }
                    skuNames[sku] = nameInput.value.trim();
                }
                
                // Store SKU names
                currentRequest.skuNames = skuNames;
                labData.skuModelNames[currentRequest.id] = skuNames;
                
                // Hide SKU names section and show test configuration
                document.getElementById('skuNamesSection').style.display = 'none';
                pendingSKUNames = false;
                
                // Generate sample configuration
                generateSampleConfig();
                document.getElementById('sampleConfigSection').style.display = 'block';
                
                showAlert('Model names confirmed! Please configure test details.', 'success');
            } catch (error) {
                console.error('SKU names confirmation error:', error);
                showAlert('Error confirming model names', 'error');
            }
        }
        
        // Generate sample configuration with model names
        function generateSampleConfig() {
            try {
                const container = document.getElementById('sampleConfigContainer');
                if (!container || !currentRequest) {
                    console.error('Container or currentRequest not found:', { container, currentRequest });
                    return;
                }
                
                container.innerHTML = '';
                
                const tests = labData.testConfigs[currentRequest.productType] || [];
                if (tests.length === 0) {
                    showAlert(`No test configurations found for product type: ${currentRequest.productType}`, 'error');
                    return;
                }
                
                for (let sku = 1; sku <= currentRequest.numSKUs; sku++) {
                    const modelName = currentRequest.skuNames[sku];
                    
                    if (!modelName) {
                        showAlert(`Model name for SKU ${sku} not found. Please go back and enter model names.`, 'error');
                        return;
                    }
                    
                    for (let sample = 1; sample <= currentRequest.numSamples; sample++) {
                        const sampleId = `${currentRequest.productClass}-${currentRequest.productType}-${modelName}-S${sample}`;
                        
                        const sampleDiv = document.createElement('div');
                        sampleDiv.className = 'sample-config';
                        sampleDiv.innerHTML = `
                            <h4>${currentRequest.productClass} - ${currentRequest.testType} - ${modelName} - Sample ${sample}</h4>
                            
                            <div style="margin: 15px 0;">
                                <label>Select Tests:</label>
                                <div class="checkbox-group">
                                    ${tests.map((test, index) => `
                                        <div class="checkbox-wrapper">
                                            <input type="checkbox" id="${sampleId}-test-${index}" 
                                                   value="${test.name}" checked
                                                   onchange="updateTestSequence('${sampleId}', ${index})">
                                            <label for="${sampleId}-test-${index}">${test.name}</label>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            
                            <div id="${sampleId}-spec-container"></div>
                            
                            <div style="margin: 15px 0;">
                                <label>Assign Technician:</label>
                                <select id="${sampleId}-technician">
                                    <option value="">Auto-assign</option>
                                    ${getAvailableTechniciansInShift().map(tech => 
                                        `<option value="${tech.name}">${tech.name} (${tech.id})</option>`
                                    ).join('')}
                                </select>
                            </div>
                            
                            <div style="margin: 15px 0;">
                                <label>Test Sequence (Set order for selected tests):</label>
                                <div class="test-sequence" id="${sampleId}-sequence">
                                    ${tests.map((test, index) => `
                                        <div class="sequence-item" id="${sampleId}-seq-item-${index}">
                                            <input type="number" id="${sampleId}-seq-${index}" 
                                                   value="${index + 1}" min="1" max="${tests.length}"
                                                   onchange="validateSequence('${sampleId}')">
                                            <span>${test.name}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `;
                        
                        container.appendChild(sampleDiv);
                        
                        // Generate specification selectors for each test
                        tests.forEach((test, index) => {
                            try {
                                updateTestSpecSelector(sampleId, index, test);
                            } catch (error) {
                                console.error(`Error updating spec selector for test ${index}:`, error);
                            }
                        });
                    }
                }
                
                // Update preview after generating sample config
                updatePreview();
                
            } catch (error) {
                console.error('Sample config generation error:', error);
                showAlert('Error generating sample configuration: ' + error.message, 'error');
            }
        }
        
        // Confirm test configuration
        function confirmTestConfiguration() {
            try {
                if (!currentRequest) {
                    showAlert('No active request found', 'error');
                    return;
                }
                
                const tests = labData.testConfigs[currentRequest.productType] || [];
                if (tests.length === 0) {
                    showAlert('No test configurations found for this product type', 'error');
                    return;
                }
                
                // Verify SKU names exist
                if (!currentRequest.skuNames) {
                    showAlert('SKU names not found. Please go back and enter model names.', 'error');
                    return;
                }
                
                for (let sku = 1; sku <= currentRequest.numSKUs; sku++) {
                    const modelName = currentRequest.skuNames[sku];
                    
                    if (!modelName) {
                        showAlert(`Model name for SKU ${sku} not found`, 'error');
                        return;
                    }
                    
                    for (let sample = 1; sample <= currentRequest.numSamples; sample++) {
                        const sampleId = `${currentRequest.productClass}-${currentRequest.productType}-${modelName}-S${sample}`;
                        
                        const selectedTests = [];
                        let foundCheckedTest = false;
                        
                        tests.forEach((test, index) => {
                            const checkboxId = `${sampleId}-test-${index}`;
                            const checkbox = document.getElementById(checkboxId);
                            
                            if (checkbox && checkbox.checked) {
                                foundCheckedTest = true;
                                const seqInput = document.getElementById(`${sampleId}-seq-${index}`);
                                
                                // Get selected specification set
                                let selectedSpecSet = null;
                                if (test.specificationSets && test.specificationSets.length > 0) {
                                    const selectedRadio = document.querySelector(`input[name="${sampleId}-spec-${index}"]:checked`);
                                    if (selectedRadio) {
                                        const setIndex = parseInt(selectedRadio.value);
                                        if (test.specificationSets[setIndex]) {
                                            selectedSpecSet = test.specificationSets[setIndex];
                                        }
                                    } else {
                                        // Default to first spec set if none selected
                                        selectedSpecSet = test.specificationSets[0];
                                    }
                                }
                                
                                selectedTests.push({
                                    name: test.name,
                                    sequence: parseInt(seqInput?.value) || (index + 1),
                                    config: {
                                        ...test,
                                        selectedSpecSet: selectedSpecSet
                                    }
                                });
                            }
                        });
                        
                        if (!foundCheckedTest) {
                            showAlert(`No tests selected for ${sampleId}. Please select at least one test.`, 'warning');
                            return;
                        }
                        
                        selectedTests.sort((a, b) => a.sequence - b.sequence);
                        
                        const technicianSelect = document.getElementById(`${sampleId}-technician`);
                        const technician = technicianSelect ? technicianSelect.value : '';
                        
                        const sampleData = {
                            id: sampleId,
                            modelName: modelName,
                            sku: sku,
                            sampleNumber: sample,
                            tests: selectedTests.map(t => t.name),
                            testConfigs: selectedTests.map(t => t.config),
                            technician: technician || 'Auto-assigned',
                            status: 'pending',
                            currentTest: 0,
                            testResults: {},
                            testFiles: {}
                        };
                        
                        currentRequest.samples.push(sampleData);
                    }
                }
                
                if (currentRequest.samples.length === 0) {
                    showAlert('No samples were configured. Please check your test selection.', 'error');
                    return;
                }
                
                labData.testQueue.push(currentRequest);

                // Add deadline tracking when request is submitted
// Calculate expected completion based on lead time
const leadTime = calculateProductLeadTime(
    currentRequest.productType,
    currentRequest.numSKUs,
    currentRequest.numSamples
);
const deadline = new Date();
deadline.setHours(deadline.getHours() + leadTime);
labData.requestDeadlines[currentRequest.id] = {
    expectedCompletion: deadline,
    actualLeadTime: leadTime
};






                processTestQueue();
                
                // Clear form
                const elements = ['productType', 'productClass', 'testType', 'numSKUs', 'numSamples'];
                elements.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = id === 'numSKUs' || id === 'numSamples' ? '1' : '';
                });
                
                const previewSection = document.getElementById('previewSection');
                const sampleConfigSection = document.getElementById('sampleConfigSection');
                const skuNamesSection = document.getElementById('skuNamesSection');
                if (previewSection) previewSection.style.display = 'none';
                if (sampleConfigSection) sampleConfigSection.style.display = 'none';
                if (skuNamesSection) skuNamesSection.style.display = 'none';
                
                currentRequest = null;
                
                updateMetrics();
                showAlert('Test configuration confirmed successfully!', 'success');
                
            } catch (error) {
                console.error('Test configuration confirmation error:', error);
                showAlert(`Error confirming test configuration: ${error.message}`, 'error');
            }
        }
        function cleanupDuplicateTests() {
            const uniqueTests = [];
            const seenTests = new Set();
            
            labData.activeTests.forEach(test => {
                const testKey = `${test.sampleId}-${test.test}`;
                if (!seenTests.has(testKey)) {
                    seenTests.add(testKey);
                    uniqueTests.push(test);
                }
            });
            
            labData.activeTests = uniqueTests;
        }
        
        // FIXED: Process test queue with proper man hour allocation for multiple technicians
        function processTestQueue() {
            try {
                // Initialize technician workload tracking if not exists
                labData.technicians.forEach(tech => {
                    if (!tech.assignedTests) tech.assignedTests = [];
                    if (tech.currentWorkload === undefined) tech.currentWorkload = 0;
                });

                labData.testQueue.forEach(request => {
                    request.samples.forEach(sample => {
                        if (sample.status === 'pending' && sample.tests.length > 0 && sample.currentTest < sample.tests.length) {
                            const currentTestName = sample.tests[sample.currentTest];
                            const testConfig = sample.testConfigs[sample.currentTest];
                            
                            if (testConfig) {
                                let selectedMachines = [];
                                let canStart = true;
                                
                                for (const machineType of testConfig.machines) {
                                    const availableMachines = labData.machines.filter(m => m.type === machineType);
                                    
                                    if (availableMachines.length === 0) {
                                        console.error(`No available machines of type ${machineType}`);
                                        canStart = false;
                                        break;
                                    }
                                    
                                    let bestMachine = null;
                                    let lowestQueue = Infinity;
                                    
                                    availableMachines.forEach(machine => {
                                        let machineQueue = 0;
                                        labData.activeTests.forEach(test => {
                                            if (test.assignedMachines && test.assignedMachines.includes(machine.id)) {
                                                machineQueue++;
                                            }
                                        });
                                        
                                        if (machineQueue < lowestQueue && machineQueue < 2) {
                                            lowestQueue = machineQueue;
                                            bestMachine = machine;
                                        }
                                    });
                                    
                                    if (bestMachine) {
                                        selectedMachines.push(bestMachine);
                                        console.log(`Selected machine ${bestMachine.name} (${bestMachine.type}) for test ${currentTestName}`);
                                    } else {
                                        console.error(`No suitable machine available for ${machineType}`);
                                        canStart = false;
                                        break;
                                    }
                                }
                                
                                if (canStart && selectedMachines.length === testConfig.machines.length) {
                                    sample.status = 'in-progress';
sample.startTime = new Date();
sample.estimatedCompletion = new Date(sample.startTime.getTime() + (testConfig.cycleTime * 60 * 60 * 1000));
                                    
                                    const activeTest = {
requestId: request.id,
    productClass: request.productClass,
    testType: request.testType,
sampleId: sample.id,
    modelName: sample.modelName,
    test: currentTestName,
    machines: testConfig.machines,
assignedMachines: selectedMachines.map(m => m.id),
assignedMachineNames: selectedMachines.map(m => m.name),
    technician: sample.technician,
    startTime: sample.startTime,
    estimatedCompletion: new Date(sample.startTime.getTime() + (testConfig.cycleTime * 60 * 60 * 1000)),
    status: 'in-progress',
    cycleTime: testConfig.cycleTime,  // Machine run time
    manHours: testConfig.manHours,    // Actual technician time needed (no fallback)
    techniciansRequired: testConfig.technicians || 1,
    selectedSpecSet: testConfig.selectedSpecSet || null,
    technicianNeededAt: 'start',  // When technician is needed: 'start', 'end', 'continuous'
    technicianWorkPeriods: []     // Track when technician actually works
};
 
// Calculate actual technician work periods
if (testConfig.manHours < testConfig.cycleTime) {
    // Technician only needed at start/end
    activeTest.technicianNeededAt = 'start-end';
    activeTest.technicianWorkPeriods = [
        { start: 0, duration: testConfig.manHours / 2 },  // Half at start
        { start: testConfig.cycleTime - (testConfig.manHours / 2), duration: testConfig.manHours / 2 }  // Half at end
    ];
} else {
    // Technician needed continuously
    activeTest.technicianNeededAt = 'continuous';
    activeTest.technicianWorkPeriods = [
        { start: 0, duration: testConfig.manHours }
    ];
}
const testExists = labData.activeTests.some(t => 
    t.sampleId === activeTest.sampleId && t.test === activeTest.test
);

if (!testExists) {
    labData.activeTests.push(activeTest);
    dedupeActiveTests();
}          

    // FIXED: Allocate man hours for multiple technicians with shift handover
   const techniciansRequired = testConfig.technicians || 1;
   const manHoursPerTech = testConfig.manHours || testConfig.cycleTime;
   const currentShift = getCurrentShift();
   const shiftRemaining = getShiftRemainingTime(currentShift);
   
   try {
       if (sample.technician === 'Auto-assigned') {
           console.log('Processing auto-assignment for test:', currentTestName);
           const techniciansInShift = getAvailableTechniciansInShift();
           console.log('Available technicians in shift:', techniciansInShift.map(t => t.name));
           
           // Filter out technicians who are already at full capacity (100% utilization)
           const availableTechs = techniciansInShift.filter(tech => (tech.currentWorkload || 0) < 8); // Assuming 8-hour shift
           
           if (availableTechs.length === 0) {
               console.error('No available technicians in current shift');
               return; // Skip this test for now
           }
           
           // Sort technicians by current workload (least busy first)
           const sortedTechs = [...availableTechs].sort((a, b) => 
               (a.currentWorkload || 0) - (b.currentWorkload || 0)
           );
           
           // Calculate work per technician
           const assignedTechs = [];
           const workPerTech = manHoursPerTech / techniciansRequired;
           
           for (let i = 0; i < Math.min(techniciansRequired, sortedTechs.length); i++) {
               const tech = sortedTechs[i];
               if (!tech.assignedTests) tech.assignedTests = [];
               
               // Add test to technician's assigned tests
               tech.assignedTests.push({
                   testId: sample.id,
                   testName: currentTestName,
                   startTime: new Date(),
                   manHours: workPerTech
               });
               
               // Update technician's workload
               tech.currentWorkload = (tech.currentWorkload || 0) + workPerTech;
               assignedTechs.push(tech.name);
               
               console.log(`Assigned ${workPerTech} hours to ${tech.name} (new workload: ${tech.currentWorkload} hours)`);
               
               // Track spillover work if needed
               const currentShiftRemaining = getShiftRemainingTime();
               if (workPerTech > currentShiftRemaining) {
                   activeTest.spilloverHours = (activeTest.spilloverHours || 0) + (workPerTech - currentShiftRemaining);
                   activeTest.needsHandover = true;
                   console.log(`Work will spill over to next shift: ${activeTest.spilloverHours} hours`);
               }
           }
           
           // Update the test with assigned technicians
           if (assignedTechs.length > 0) {
               sample.technician = assignedTechs.join(', ');
               activeTest.technician = assignedTechs.join(', ');
           }
       } else {
           // Handle manually assigned technician(s)
           const tech = labData.technicians.find(t => t.name === sample.technician);
           if (tech) {
               if (!tech.assignedTests) tech.assignedTests = [];
               tech.assignedTests.push({
                   testId: sample.id,
                   testName: currentTestName,
                   startTime: new Date(),
                   manHours: manHoursPerTech
               });
               
               const totalWork = manHoursPerTech * techniciansRequired;
               const workInThisShift = Math.min(totalWork, shiftRemaining);
               tech.currentWorkload = (tech.currentWorkload || 0) + workInThisShift;
        
               // Track spillover work
               if (totalWork > shiftRemaining) {
                   activeTest.spilloverHours = totalWork - shiftRemaining;
                   activeTest.needsHandover = true;
               }
           }
       }
   } catch (error) {
       console.error('Error in technician assignment:', error);
   }


                                }
                            }
                        }
                    });
                });
                updateMachineTable();
            } catch (error) {
                console.error('Test queue processing error:', error);
            }
            cleanupDuplicateTests();
        }
        // Calculate product lead time (for initial preview)
        function calculateProductLeadTime(productType, numSKUs, numSamples) {
    try {
        const tests = labData.testConfigs[productType] || [];
        if (tests.length === 0) return 0;
        
        // Get machine availability by type
        const machinesByType = {};
        labData.machines.forEach(machine => {
            if (!machinesByType[machine.type]) {
                machinesByType[machine.type] = [];
            }
            machinesByType[machine.type].push(machine);
        });
        
        const totalSamples = numSKUs * numSamples;
        
        // Create a timeline for each machine to track when it will be free
        const machineTimelines = {};
        labData.machines.forEach(machine => {
machineTimelines[machine.id] = 0; // Start time for each machine
            
            // Add current active tests to timeline
            labData.activeTests.forEach(activeTest => {
if (activeTest.assignedMachines && activeTest.assignedMachines.includes(machine.id)) {
                    const remainingHours = getRemainingTestHours(activeTest);
machineTimelines[machine.id] = Math.max(machineTimelines[machine.id], remainingHours);
                }
            });
        });
        
        // Simulate scheduling all samples through all tests
        let maxCompletionTime = 0;
        const sampleCompletionTimes = [];
        
        for (let sample = 0; sample < totalSamples; sample++) {
            let sampleStartTime = 0;
            
            // For each test in sequence for this sample
            tests.forEach(test => {
                let earliestStartTime = sampleStartTime;
                let selectedMachines = [];
                let missingMachineTypes = [];
                
                // Find the earliest time ALL required machines are available
                test.machines.forEach(machineType => {
                    const availableMachines = machinesByType[machineType] || [];
                    if (availableMachines.length === 0) {
                        // No machine available, use large number
                        missingMachineTypes.push(machineType);
                        return; // skip this machineType in preview
                    } else {
                        // Find machine that will be free earliest
                        let bestMachine = null;
                        let bestMachineAvailableTime = Infinity;
                        
                        availableMachines.forEach(machine => {
const availableTime = Math.max(machineTimelines[machine.id], sampleStartTime);
                            if (availableTime < bestMachineAvailableTime) {
                                bestMachineAvailableTime = availableTime;
                                bestMachine = machine;
                            }
                        });
                        
                        if (bestMachine) {
                            selectedMachines.push(bestMachine);
                            earliestStartTime = Math.max(earliestStartTime, bestMachineAvailableTime);
                        }
                    }
                });
                if (missingMachineTypes.length > 0) {
                    console.warn('Preview missing machine types:', missingMachineTypes);
                    return; // do not advance time for this test in preview
                }
                // Schedule test on selected machines
                const testEndTime = earliestStartTime + test.cycleTime;
                selectedMachines.forEach(machine => {
machineTimelines[machine.id] = testEndTime;
                });
                
                // Update sample's next test start time
                sampleStartTime = testEndTime;
            });
            
            sampleCompletionTimes.push(sampleStartTime);
            maxCompletionTime = Math.max(maxCompletionTime, sampleStartTime);
        }
        
        return maxCompletionTime;
    } catch (error) {
        console.error('Lead time calculation error:', error);
        return 0;
    }
}
        
        // Analyze capacity
        function analyzeCapacity(machineRequirements, technicianHours, machineQueues) {
            try {
              const baseline = calculateLabCapacity(); // 'LOW LOAD' | 'NORMAL' | 'HIGH LOAD' | 'MAX LOAD'
              let queueStatus = 'NORMAL';
              let details = [];
              let overloadedMachines = [];
          
              Object.entries(machineQueues).forEach(([machineType, q]) => {
                if (q.machines.length === 0 && q.additionalTests > 0) {
                  queueStatus = 'MAX LOAD';
                  details.push(`No ${machineType.replace(/_/g, ' ')} available`);
                } else if (q.isOverloaded || q.queuePerMachine > 2) {
                  queueStatus = 'MAX LOAD';
                  overloadedMachines.push(machineType);
                  details.push(`${machineType.replace(/_/g, ' ').toUpperCase()} queue will exceed 2 (projected queue: ${q.queuePerMachine})`);
                } else if (q.queuePerMachine > 1 && queueStatus !== 'MAX LOAD') {
                  queueStatus = 'HIGH LOAD';
                }
              });
          
              const order = ['LOW LOAD', 'NORMAL', 'HIGH LOAD', 'MAX LOAD'];
              const status = order[Math.max(order.indexOf(baseline), order.indexOf(queueStatus))];
          
              if (overloadedMachines.length > 0) {
                details.push('💡 Recommendation: Consider scheduling tests at different times or adding more machines');
              }
              return { status, details, baseline, queueStatus };
            } catch (e) {
              console.error('Capacity analysis error:', e);
              return { status: 'NORMAL', details: [] };
            }
          }
          

        
        // Enhanced preview update function with machine queue forecasting
        function updatePreview() {
            try {
                const productTypeEl = document.getElementById('productType');
                const productClassEl = document.getElementById('productClass');
                const testTypeEl = document.getElementById('testType');
                const numSKUsEl = document.getElementById('numSKUs');
                const numSamplesEl = document.getElementById('numSamples');
                
                if (!productTypeEl || !productClassEl || !testTypeEl || !numSKUsEl || !numSamplesEl) {
                    return;
                }
                
                const productType = productTypeEl.value;
                const productClass = productClassEl.value;
                const testType = testTypeEl.value;
                const numSKUs = parseInt(numSKUsEl.value) || 0;
                const numSamples = parseInt(numSamplesEl.value) || 0;
                
                const previewSection = document.getElementById('previewSection');
                if (!previewSection) return;
                
                if (!productType || !productClass || !testType || numSKUs === 0 || numSamples === 0) {
                    previewSection.style.display = 'none';
                    return;
                }
                
                const tests = labData.testConfigs[productType] || [];
                let totalPower = 0;
                let machineRequirements = {};
                let technicianHours = 0;
                
                // Calculate using selected tests if sample config is visible
                const totalLeadTime = calculateProductLeadTime(productType, numSKUs, numSamples);
                
                // Calculate machine requirements and man hours properly
                tests.forEach(test => {
                    const testInstances = numSKUs * numSamples;
                    totalPower += test.power * numSamples;
                    // FIXED: Calculate total man hours for all technicians required
                    const techniciansRequired = test.technicians || 1;
                    technicianHours += (test.manHours || test.cycleTime) * techniciansRequired * testInstances;
                    
                    test.machines.forEach(machine => {
                        if (!machineRequirements[machine]) {
                            machineRequirements[machine] = 0;
                        }
                        machineRequirements[machine] += testInstances;
                    });
                });
                
                // Calculate machine queues with the new requirements
                const machineQueues = calculateMachineQueues(machineRequirements);
                
                const capacityAnalysis = analyzeCapacity(machineRequirements, technicianHours, machineQueues);
                const completionDate = new Date();
                completionDate.setHours(completionDate.getHours() + totalLeadTime);
                
                const previewPowerEl = document.getElementById('previewPower');
                const previewLeadTimeEl = document.getElementById('previewLeadTime');
                const previewCompletionEl = document.getElementById('previewCompletion');
                const previewStatusEl = document.getElementById('previewStatus');
                const capacityDetailsEl = document.getElementById('capacityDetails');
                const machineQueuePreviewEl = document.getElementById('machineQueuePreview');
                
                if (previewPowerEl) previewPowerEl.textContent = totalPower.toFixed(1) + ' kW';
                if (previewLeadTimeEl) previewLeadTimeEl.textContent = formatTimeInDHM(totalLeadTime);
                if (previewCompletionEl) previewCompletionEl.textContent = formatDateTime(completionDate);
                
// Unify labels + color and show "baseline → projected"
if (previewStatusEl) {
    // fallback to calculateLabCapacity() if analyzeCapacity didn't return baseline
    const baselineRaw =
      (capacityAnalysis && capacityAnalysis.baseline) ||
      (typeof calculateLabCapacity === 'function' ? calculateLabCapacity() : 'NORMAL');
  
    const projectedRaw = (capacityAnalysis && capacityAnalysis.status) || 'NORMAL';
  
    // normalize labels
    const norm = s => {
      s = String(s || '').toUpperCase();
      if (s === 'OVERLOAD') return 'MAX LOAD';      // map old label to unified one
      if (s === 'HIGHLOAD') return 'HIGH LOAD';
      if (s === 'LOW') return 'LOW LOAD';
      return s;
    };
  
    const baseline  = norm(baselineRaw);
    const projected = norm(projectedRaw);
  
    // text
    previewStatusEl.textContent = baseline === projected
      ? projected
      : `${baseline} → ${projected}`;
  
    // color by projected status
    const color =
      projected === 'MAX LOAD' ? '#ff5252' :
      projected === 'HIGH LOAD' ? '#ffeb3b' :
      '#81c784'; // NORMAL / LOW LOAD
    previewStatusEl.style.color = color;
  }
  
                
                if (capacityDetailsEl) {
                    if (capacityAnalysis.details.length > 0) {
                        capacityDetailsEl.innerHTML = `
                            <div class="overload-details">
                                <strong>⚠️ Capacity Issues:</strong>
                                <ul>
                                    ${capacityAnalysis.details.map(d => `<li>${d}</li>`).join('')}
                                </ul>
                            </div>
                        `;
                    } else {
                        capacityDetailsEl.innerHTML = '';
                    }
                }

                // Show machine queue preview
if (machineQueuePreviewEl && Object.keys(machineQueues).length > 0) {
    let queueHtml = '<div class="machine-queue-details"><h5>📊 Machine Queue Forecast:</h5>';
    
    Object.entries(machineQueues).forEach(([machineType, queueData]) => {
        // Always show the machine queue, even if there are no additional tests
        const statusClass = queueData.isOverloaded ? 'overload' :
                          queueData.queuePerMachine > 1 ? 'warning' : 'normal';
        const statusText = queueData.isOverloaded ? 'OVERLOADED' :
                         queueData.queuePerMachine > 1 ? 'High Load' : 'Normal';
        
        queueHtml += `
            <div class="machine-queue-item ${queueData.isOverloaded ? 'overloaded' : ''}">
                <div>
                    <strong>${machineType.replace(/_/g, ' ').toUpperCase()}</strong>
                    <div style="font-size: 0.85rem; color: #888;">
                        ${queueData.machines.length} machine(s) available
                        ${queueData.currentActive > 0 ? `, ${queueData.currentActive} active` : ''}
                        ${queueData.currentPending > 0 ? `, ${queueData.currentPending} pending` : ''}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div class="queue-status ${statusClass}">
                        Queue: ${queueData.queuePerMachine}
                    </div>
                    <div style="font-size: 0.85rem; color: #888;">
                        ${statusText}
                    </div>
                </div>
            </div>
        `;
    });
    
    queueHtml += '</div>';
    machineQueuePreviewEl.innerHTML = queueHtml;
} else if (machineQueuePreviewEl) {
    machineQueuePreviewEl.innerHTML = '';
}


                
                // Show machine queue preview
                if (machineQueuePreviewEl && Object.keys(machineQueues).length > 0) {
                    let queueHtml = '<div class="machine-queue-details"><h5>📊 Machine Queue Forecast:</h5>';
                    
                    Object.entries(machineQueues).forEach(([machineType, queueData]) => {
                        if (queueData.additionalTests > 0) {
                            const statusClass = queueData.isOverloaded ? 'overload' : 
                                              queueData.queuePerMachine > 1 ? 'warning' : 'normal';
                            const statusText = queueData.isOverloaded ? 'OVERLOADED' : 
                                             queueData.queuePerMachine > 1 ? 'High Load' : 'Normal';
                            
                            queueHtml += `
                                <div class="machine-queue-item ${queueData.isOverloaded ? 'overloaded' : ''}">
                                    <div>
                                        <strong>${machineType.replace(/_/g, ' ').toUpperCase()}</strong>
                                        <div style="font-size: 0.85rem; color: #888;">
                                            ${queueData.machines.length} machine(s) available
                                        </div>
                                    </div>
                                    <div style="text-align: right;">
                                        <div class="queue-status ${statusClass}">
                                            Queue: ${queueData.queuePerMachine}
                                        </div>
                                        <div style="font-size: 0.85rem; color: #888;">
                                            ${statusText}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }
                    });
                    
                    queueHtml += '</div>';
                    machineQueuePreviewEl.innerHTML = queueHtml;
                } else if (machineQueuePreviewEl) {
                    machineQueuePreviewEl.innerHTML = '';
                }
                
                previewSection.style.display = 'block';
            } catch (error) {
                console.error('Preview update error:', error);
            }
        }
        
        // Tab switching
        function switchTab(tabName) {
            try {
                document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                
                // Find the clicked tab button
                const clickedTab = Array.from(document.querySelectorAll('.tab')).find(tab => 
                    tab.onclick && tab.onclick.toString().includes(tabName)
                );
                if (clickedTab) {
                    clickedTab.classList.add('active');
                }
                
                const tabContent = document.getElementById(tabName);
                if (tabContent) {
                    tabContent.classList.add('active');
                }
                
                if (tabName === 'progress') {
                    updateProgressTab();
                } else if (tabName === 'testing') {
                    updateTestingTab();
                } else if (tabName === 'resources') {
                    updateMachineTable();
                    updateTechnicianTable();
                } else if (tabName === 'lifecycle') {
                    updateLifecycleDisplay();
                }
            } catch (error) {
                console.error('Tab switching error:', error);
            }
        }
        
        // Progress Tab Functions
        function updateProgressTab() {
            try {
                checkTimelineReset(); // Check for daily reset
                updateTimeline();
                updateActiveTestsTable();
            } catch (error) {
                console.error('Progress tab update error:', error);
            }
        }
        
        // Testing Tab Functions
        function updateTestingTab() {
            try {
                refreshTestDropdown();
            } catch (error) {
                console.error('Testing tab update error:', error);
            }
        }
        
        // Other helper functions for test sequence, modals, etc.
        function updateTestSequence(sampleId, changedIndex) {
            try {
                if (!currentRequest) return;
                const tests = labData.testConfigs[currentRequest.productType] || [];
                
                tests.forEach((test, index) => {
                    const checkbox = document.getElementById(`${sampleId}-test-${index}`);
                    const seqItem = document.getElementById(`${sampleId}-seq-item-${index}`);
                    const seqInput = document.getElementById(`${sampleId}-seq-${index}`);
                    const specDiv = document.getElementById(`${sampleId}-spec-${index}`);
                    
                    if (checkbox && seqItem && seqInput) {
                        if (checkbox.checked) {
                            seqItem.style.display = 'flex';
                            seqInput.disabled = false;
                            if (specDiv) specDiv.style.display = 'block';
                            
                            if (index === changedIndex) {
                                updateTestSpecSelector(sampleId, index, test);
                            }
                        } else {
                            seqItem.style.display = 'none';
                            seqInput.disabled = true;
                            if (specDiv) specDiv.style.display = 'none';
                        }
                    }
                });
                
                validateSequence(sampleId);
                updatePreview();
            } catch (error) {
                console.error('Test sequence update error:', error);
            }
        }
        
        function validateSequence(sampleId) {
            try {
                if (!currentRequest) return;
                const tests = labData.testConfigs[currentRequest.productType] || [];
                const sequences = [];
                
                tests.forEach((test, index) => {
                    const checkbox = document.getElementById(`${sampleId}-test-${index}`);
                    const seqInput = document.getElementById(`${sampleId}-seq-${index}`);
                    
                    if (checkbox && seqInput && checkbox.checked && seqInput.value) {
                        sequences.push(parseInt(seqInput.value));
                    }
                });
                
                const hasDuplicates = sequences.length !== new Set(sequences).size;
                if (hasDuplicates) {
                    showAlert('Duplicate sequence numbers detected! Please use unique numbers.', 'warning');
                }
                
                updatePreview();
            } catch (error) {
                console.error('Sequence validation error:', error);
            }
        }
        
        function updateTestSpecSelector(sampleId, testIndex, test) {
            try {
                const container = document.getElementById(`${sampleId}-spec-container`);
                if (!container) return;
                
                const checkbox = document.getElementById(`${sampleId}-test-${testIndex}`);
                if (!checkbox || !checkbox.checked) return;
                
                let specDiv = document.getElementById(`${sampleId}-spec-${testIndex}`);
                if (!specDiv) {
                    specDiv = document.createElement('div');
                    specDiv.id = `${sampleId}-spec-${testIndex}`;
                    specDiv.className = 'spec-selector';
                    container.appendChild(specDiv);
                }
                
                if (test.specificationSets && test.specificationSets.length > 0) {
                    specDiv.innerHTML = `
                        <h5 style="color: #ffd700; margin-bottom: 10px;">${test.name} Specification:</h5>
                        ${test.specificationSets.map((specSet, setIndex) => `
                            <div class="spec-radio ${setIndex === 0 ? 'selected' : ''}" 
                                 onclick="selectSpecificationSet('${sampleId}', ${testIndex}, ${setIndex})">
                                <input type="radio" 
                                       id="${sampleId}-spec-${testIndex}-${setIndex}" 
                                       name="${sampleId}-spec-${testIndex}"
                                       ${setIndex === 0 ? 'checked' : ''}
                                       value="${setIndex}">
                                <div class="spec-radio-content">
                                    <label for="${sampleId}-spec-${testIndex}-${setIndex}">
                                        <strong>${specSet.name || `Set ${setIndex + 1}`}</strong>
                                    </label>
                                    <div class="spec-params">
                                        ${specSet.parameters.map(param => 
                                            `<span class="spec-param">${param.name}: ${param.value}</span>`
                                        ).join('')}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    `;
                }
            } catch (error) {
                console.error('Test spec selector update error:', error);
            }
        }
        
        function selectSpecificationSet(sampleId, testIndex, setIndex) {
            try {
                const allRadios = document.querySelectorAll(`#${sampleId}-spec-${testIndex} .spec-radio`);
                allRadios.forEach(radio => radio.classList.remove('selected'));
                
                const selectedRadio = document.querySelector(`#${sampleId}-spec-${testIndex}-${setIndex}`);
                if (selectedRadio) {
                    selectedRadio.checked = true;
                    selectedRadio.parentElement.classList.add('selected');
                }
                
                updatePreview();
            } catch (error) {
                console.error('Specification set selection error:', error);
            }
        }
        
        // Handle test result change
        function handleTestResultChange() {
            try {
                const testResult = document.getElementById('testResult')?.value;
                const ncObservationSection = document.getElementById('ncObservationSection');
                const ncTypeSection = document.getElementById('ncTypeSection');
                const hasNcObservation = document.getElementById('hasNcObservation');
                const ncType = document.getElementById('ncType');
                
                if (!ncObservationSection || !ncTypeSection || !hasNcObservation || !ncType) return;
                
                // Reset sections
                ncObservationSection.classList.remove('visible');
                ncTypeSection.classList.remove('visible');
                hasNcObservation.value = '';
                ncType.value = '';
                
                if (testResult === 'pass') {
                    // Show NC/Observation dropdown for Pass
                    ncObservationSection.classList.add('visible');
                } else if (testResult === 'fail') {
                    // Directly show NC Type dropdown for Fail
                    ncTypeSection.classList.add('visible');
                } else {
                    // Hide both sections
                    ncObservationSection.classList.remove('visible');
                    ncTypeSection.classList.remove('visible');
                }
            } catch (error) {
                console.error('Test result change error:', error);
            }
        }
        
        // Handle NC/Observation change
        function handleNcObservationChange() {
            try {
                const hasNcObservation = document.getElementById('hasNcObservation')?.value;
                const ncTypeSection = document.getElementById('ncTypeSection');
                const ncType = document.getElementById('ncType');
                
                if (!ncTypeSection || !ncType) return;
                
                if (hasNcObservation === 'yes') {
                    ncTypeSection.classList.add('visible');
                } else {
                    ncTypeSection.classList.remove('visible');
                    ncType.value = '';
                }
            } catch (error) {
                console.error('NC observation change error:', error);
            }
        }
        
        // File handling functions
        function handleFileSelect(type) {
            try {
                const inputId = type === 'before' ? 'beforeTestFiles' : 'afterTestFiles';
                const previewId = type === 'before' ? 'beforeFilePreview' : 'afterFilePreview';
                const input = document.getElementById(inputId);
                const preview = document.getElementById(previewId);
                
                if (!input || !preview) return;
                
                const files = input.files;
                preview.innerHTML = '';
                
                if (!labData.testFiles.currentTest) {
                    labData.testFiles.currentTest = { before: [], after: [] };
                }
                
                labData.testFiles.currentTest[type] = [];
                
                Array.from(files).forEach((file, index) => {
                    if (file.size > 10 * 1024 * 1024) { // 10MB limit
                        showAlert('File size should be less than 10MB', 'warning');
                        return;
                    }
                    
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const fileData = {
                            name: file.name,
                            type: file.type,
                            data: e.target.result
                        };
                        
                        labData.testFiles.currentTest[type].push(fileData);
                        
                        const previewItem = document.createElement('div');
                        previewItem.className = 'file-preview-item';
                        
                        if (file.type.startsWith('image/')) {
                            previewItem.innerHTML = `
                                <img src="${e.target.result}" alt="${file.name}">
                                <button class="remove-file" onclick="removeFile('${type}', ${index})">×</button>
                            `;
                        } else if (file.type.startsWith('video/')) {
                            previewItem.innerHTML = `
                                <video src="${e.target.result}"></video>
                                <button class="remove-file" onclick="removeFile('${type}', ${index})">×</button>
                            `;
                        }
                        
                        preview.appendChild(previewItem);
                    };
                    reader.readAsDataURL(file);
                });
            } catch (error) {
                console.error('File handling error:', error);
                showAlert('Error handling files', 'error');
            }
        }
        
        function removeFile(type, index) {
            try {
                if (labData.testFiles.currentTest && labData.testFiles.currentTest[type]) {
                    labData.testFiles.currentTest[type].splice(index, 1);
                    handleFileSelect(type);
                }
            } catch (error) {
                console.error('File removal error:', error);
            }
        }
        
        function showMachineDetails() {
            try {
                const modal = document.getElementById('machineModal');
                const content = document.getElementById('machineDetailsContent');
                
                if (!modal || !content) return;
                
                const now = new Date();
                const hoursRemainingToday = getHoursRemainingInDay(now);
                
                let html = '<div class="grid">';
                
                // Filter out the "No Machine Required" machine
                const filteredMachines = labData.machines.filter(machine => machine.id !== 'NILL-001');
                
                filteredMachines.forEach(machine => {
                    let todayBusyHours = 0;
                    
                    labData.activeTests.forEach(test => {
                        if (test.assignedMachines && test.assignedMachines.includes(machine.id)) {
                            const remainingTestHours = getRemainingTestHours(test);
                            const hoursInToday = Math.min(remainingTestHours, hoursRemainingToday);
                            todayBusyHours += hoursInToday;
                        }
                    });
                    
                    let utilization = 0;
                    if (hoursRemainingToday > 0) {
                        utilization = Math.min((todayBusyHours / hoursRemainingToday) * 100, 100);
                    }
                    
                    html += `
                        <div class="metric-card">
                            <div class="metric-label">${machine.name}</div>
                            <div class="metric-value">${utilization.toFixed(0)}%</div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${utilization}%"></div>
                            </div>
                            <div class="metric-sublabel">${todayBusyHours.toFixed(1)}/${hoursRemainingToday.toFixed(1)} hours</div>
                        </div>
                    `;
                });
                html += '</div>';
                
                content.innerHTML = html;
                modal.style.display = 'flex';
            } catch (error) {
                console.error('Machine details modal error:', error);
            }
        }
        
        function closeMachineModal() {
            try {
                const modal = document.getElementById('machineModal');
                if (modal) modal.style.display = 'none';
            } catch (error) {
                console.error('Machine modal closing error:', error);
            }
        }
        
        function showManDetails() {
            try {
                const modal = document.getElementById('manModal');
                const content = document.getElementById('manDetailsContentV2');
                if (!modal || !content) {
                    console.error('Modal or content element not found');
                    return;
                }
                
                // Close any open modal first to prevent multiple modals
                closeManModal();
                
                // Show the modal
                modal.style.display = 'flex';
                
                // Then render the content
                renderManUtilizationDetails();
                
            } catch (error) {
                console.error('Error showing man details:', error);
            }
        }

        // Close man modal function
        function closeManModal() {
            try {
                const modal = document.getElementById('manModal');
                if (modal) modal.style.display = 'none';
            } catch (error) {
                console.error('Error closing man modal:', error);
            }
        }
        
        function showActiveProducts() {
            try {
                const modal = document.getElementById('activeProductsModal');
                const content = document.getElementById('activeProductsContent');
                
                if (!modal || !content) return;
                
                const activeProducts = getActiveProducts();
                
                if (activeProducts.length === 0) {
                    content.innerHTML = '<p>No products under test at the moment.</p>';
                } else {
                    let html = '';
                    
                    const productTests = {};
                    labData.activeTests.forEach(test => {
                        const productId = getProductId(test.sampleId);
                        if (!productTests[productId]) {
                            productTests[productId] = {
                                productType: '',
                                productClass: '',
                                testType: '',
                                tests: []
                            };
                        }
                        
                        const request = labData.testQueue.find(r => r.id === test.requestId);
                        if (request) {
                            productTests[productId].productType = request.productType;
                            productTests[productId].productClass = request.productClass;
                            productTests[productId].testType = request.testType;
                        }
                        
                        productTests[productId].tests.push(test);
                    });
                    
                    Object.entries(productTests).forEach(([productId, productData]) => {
                        html += `
                            <div class="product-group">
                                <h4>${productId}</h4>
                                <p style="color: #ccc; margin-bottom: 10px;">
                                    Type: ${productData.productType.toUpperCase()} | 
                                    Class: ${productData.productClass} | 
                                    Test Type: ${productData.testType}
                                </p>
                                <div class="product-tests">
                        `;
                        
                        productData.tests.forEach(test => {
                            const progress = calculateTestProgress(test);
                            const machineNames = test.assignedMachineNames ? 
                                test.assignedMachineNames.join(', ') : 
                                test.machines.join(', ');
                            
                            html += `
                                <div class="product-test-item">
                                    <strong>${test.sampleId} - ${test.test}</strong><br>
                                    <span style="color: #888;">
                                        Machines: ${machineNames} | 
                                        Technician: ${test.technician} | 
                                        Progress: ${progress.toFixed(0)}%
                                    </span>
                                </div>
                            `;
                        });
                        
                        html += `
                                </div>
                            </div>
                        `;
                    });
                    
                    content.innerHTML = html;
                }
                
                modal.style.display = 'flex';
            } catch (error) {
                console.error('Active products modal error:', error);
            }
        }
        
        function closeActiveProductsModal() {
            try {
                const modal = document.getElementById('activeProductsModal');
                if (modal) modal.style.display = 'none';
            } catch (error) {
                console.error('Active products modal closing error:', error);
            }
        }
        
        function closeProductStatsModal() {
            try {
                const modal = document.getElementById('productStatsModal');
                if (modal) modal.style.display = 'none';
            } catch (error) {
                console.error('Product stats modal closing error:', error);
            }
        }

        // Show on-time delivery details
        function showOnTimeDetails() {
    try {
        const modal = document.getElementById('productStatsModal');
        const content = document.getElementById('productStatsContent');
        
        if (!modal || !content) return;
        
        const totalSKUs = calculateTotalReceivedSKUs();
        const onTimePercentage = calculateOnTimePercentage();
        
        let html = '<h4>On-Time Delivery Performance</h4>';
        
        if (totalSKUs === 0) {
            html += '<p style="color: #888;">No products have been added to the system yet.</p>';
        } else {
            const actualPercentage = labData.totalCompletions === 0 ? 0 : onTimePercentage;
            const onTimeColor = actualPercentage >= 90 ? '#4caf50' :
                               actualPercentage >= 70 ? '#ffd700' : '#ff5252';
            
            html += '<div class="grid">';
            html += `
                <div class="metric-card">
                    <div class="metric-label">Overall Performance</div>
                    <div class="metric-value" style="color: ${onTimeColor};">${actualPercentage}%</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">On-Time</div>
                    <div class="metric-value" style="color: #4caf50;">${labData.onTimeCompletions}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Delayed</div>
                    <div class="metric-value" style="color: #ff5252;">${labData.totalCompletions - labData.onTimeCompletions}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Total Completed</div>
                    <div class="metric-value">${labData.totalCompletions}</div>
                </div>
            `;
            html += '</div>';
            
            html += `
                <div style="margin-top: 20px; padding: 15px; background: #1a1a1a; border-radius: 4px;">
                    <p style="color: #ccc;">
                        <strong>Total SKUs in System:</strong> ${totalSKUs}<br>
                        <strong>Completion Rate:</strong> ${totalSKUs > 0 ? Math.round((labData.totalCompletions / totalSKUs) * 100) : 0}%
                    </p>
                </div>
            `;
        }
        
        content.innerHTML = html;
modal.style.display = 'flex';
    } catch (error) {
        console.error('On-time details modal error:', error);
    }
}
        
        // Lab Resources Functions
        function addMachine() {
            try {
                const nameEl = document.getElementById('machineName');
                const idEl = document.getElementById('machineId');
                
                if (!nameEl || !idEl) {
                    showAlert('Form elements not found', 'error');
                    return;
                }
                
                const name = nameEl.value.trim();
                const id = idEl.value;
                
                if (!name || !id) {
                    showAlert('Please fill all fields', 'warning');
                    return;
                }
                
                if (labData.machines.find(m => m.id === id)) {
                    showAlert('Machine ID already exists', 'error');
                    return;
                }
                
                const type = name.toLowerCase().replace(/\s+/g, '_');
                
                labData.machines.push({
                    type,
                    name,
                    id
                });
                
                updateMachineTable();
                updateMetrics();
                showAlert('Machine added successfully!', 'success');
                
                nameEl.value = '';
                idEl.value = '';
            } catch (error) {
                console.error('Machine addition error:', error);
                showAlert('Error adding machine', 'error');
            }
        }
        
        // FIXED: Update machine table with exact queue count and simplified status
        function updateMachineTable() {
            try {
              const tbody = document.getElementById('machineInventoryBody');
              if (!tbody) return;
          
              tbody.innerHTML = '';
          
              // (Optional) You can still compute this if you use it elsewhere; not needed below
              const machineQueues = calculateMachineQueues();
          
              labData.machines.forEach((machine, index) => {
                // --- ACTIVE on this exact machine: strictly boolean 0/1 ---
                const isActiveHere = (labData.activeTests || []).some(test =>
                  test.assignedMachines && test.assignedMachines.includes(machine.id)
                );
                const activeCount = isActiveHere ? 1 : 0;
          
                // --- PENDING for this MACHINE TYPE: count only the NEXT required step per sample ---
                let pendingCount = 0;
                (labData.testQueue || []).forEach(request => {
                  (request.samples || []).forEach(sample => {
                    if (sample.status === 'pending') {
                      // Only the next needed test (currentTest)
                      const j = sample.currentTest;
                      const nextCfg = sample.testConfigs && sample.testConfigs[j];
                      if (nextCfg && Array.isArray(nextCfg.machines) && nextCfg.machines.includes(machine.type)) {
                        pendingCount += 1; // count the sample once for this machine TYPE
                      }
                    }
                  });
                });
          
                // --- Queue equals pending items waiting for this machine type (do not add active) ---
                const totalQueue = pendingCount;
          
                // --- Status display ---
                let status = 'Available';
                let statusClass = 'completed';
          
                if (activeCount > 0) {
                  status = totalQueue > 0 ? `Occupied (${totalQueue} waiting)` : 'Occupied';
                  statusClass = 'in-progress';
                  if (totalQueue > 2) {
                    status = 'Overloaded';
                    statusClass = 'failed';
                  }
                } else if (totalQueue > 0) {
                  // No job on this specific machine, but items are queued for its TYPE
                  status = 'Reserved';
                  statusClass = 'pending';
                }
          
                const row = tbody.insertRow();
                row.innerHTML = `
                  <td>${machine.name}</td>
                  <td>${machine.id}</td>
                  <td>
                    <span class="status ${statusClass}">
                      ${status.toUpperCase()}
                    </span>
                  </td>
                  <td>${totalQueue}</td>
                  <td>
                    <button class="btn-danger" onclick="removeMachine(${index})">
                      Remove
                    </button>
                  </td>`;
              });
          
              // persist any changes (your original call)
              saveMachines();
            } catch (error) {
              console.error('Machine table update error:', error);
            }
          }
          



        
        function removeMachine(index) {
            try {
                const machine = labData.machines[index];
                
                let activeCount = 0;
                labData.activeTests.forEach(test => {
                    if (test.assignedMachines && test.assignedMachines.includes(machine.id)) {
                        activeCount++;
                    }
                });
                
                if (activeCount > 0) {
                    showAlert('Cannot remove machine with active tests', 'error');
                    return;
                }
                
                labData.machines.splice(index, 1);
                updateMachineTable();
                updateMetrics();
                showAlert('Machine removed', 'info');
            } catch (error) {
                console.error('Machine removal error:', error);
                showAlert('Error removing machine', 'error');
            }
        }
        
        function addTechnician() {
            try {
                const nameEl = document.getElementById('technicianName');
                const idEl = document.getElementById('technicianId');
                const shiftEl = document.getElementById('technicianShift');
                
                if (!nameEl || !idEl || !shiftEl) {
                    showAlert('Form elements not found', 'error');
                    return;
                }
                
                const name = nameEl.value;
                const id = idEl.value;
                const shift = shiftEl.value;
                
                if (!name || !id || !shift) {
                    showAlert('Please fill all fields including shift', 'warning');
                    return;
                }
                
                if (labData.technicians.find(t => t.id === id)) {
                    showAlert('Employee ID already exists', 'error');
                    return;
                }
                
                labData.technicians.push({
                    name,
                    id,
                    shift,
                    assignedTests: [],
                    currentWorkload: 0
                });
                
                updateTechnicianTable();
                showAlert('Technician added successfully!', 'success');
                
                nameEl.value = '';
                idEl.value = '';
                shiftEl.value = '';
            } catch (error) {
                console.error('Technician addition error:', error);
                showAlert('Error adding technician', 'error');
            }
        }
        
        // FIXED: Update technician table without CURRENT STATUS column
        function updateTechnicianTable() {
            try {
                const tbody = document.getElementById('technicianTeamBody');
                if (!tbody) return;
                
                tbody.innerHTML = '';
                const currentShifts = getCurrentShift();
                const shiftRemainingTime = getShiftRemainingTime();
                
                labData.technicians.forEach((tech, index) => {
                    const isCurrentShift = currentShifts.includes(tech.shift);
                    const workload = tech.currentWorkload || 0;
                    const utilization = isCurrentShift && shiftRemainingTime > 0 ? 
                        Math.min((workload / shiftRemainingTime) * 100, 100) : 0;
                    
                    const shiftName = labData.shiftSchedule[tech.shift]?.name || tech.shift;
                    
                    const row = tbody.insertRow();
                    row.innerHTML = `
                        <td>${tech.name}</td>
                        <td>${tech.id}</td>
                        <td><span class="shift-badge">${shiftName}</span></td>
                        <td>
                            ${isCurrentShift ? `${workload.toFixed(1)}h (${utilization.toFixed(0)}%)` : 'Not in shift'}
                        </td>
                        <td>
                            <button class="btn-danger" onclick="removeTechnician(${index})">
                                Remove
                            </button>
                        </td>
                    `;
                });
            } catch (error) {
                console.error('Technician table update error:', error);
            }
        }
        
        function removeTechnician(index) {
            try {
                const tech = labData.technicians[index];
                
                if (tech.assignedTests.length > 0) {
                    showAlert('Cannot remove technician with assigned tests', 'error');
                    return;
                }
                
                labData.technicians.splice(index, 1);
                updateTechnicianTable();
                showAlert('Technician removed', 'info');
            } catch (error) {
                console.error('Technician removal error:', error);
                showAlert('Error removing technician', 'error');
            }
        }
        
        // Test Configuration Functions
        // Global variable to track if we're editing an existing test config
        let editingTestConfig = null;

        function addTestConfig(editIndex = null) {
            try {
                const categoryEl = document.getElementById('configCategory');
                const testNameEl = document.getElementById('testName');
                const hoursEl = document.getElementById('cycleHours');
                const minutesEl = document.getElementById('cycleMinutes');
                const manHoursEl = document.getElementById('manHours');
                const manMinutesEl = document.getElementById('manMinutes');
                const powerEl = document.getElementById('powerConsumption');
                const techniciansEl = document.getElementById('techRequired');
                const procedureEl = document.getElementById('testProcedure');
                const submitButton = document.querySelector('button[onclick*="addTestConfig"]');
                
                // Set button text based on edit mode
                if (submitButton) {
                    const inEditMode = window.currentEdit !== undefined;
                    submitButton.textContent = inEditMode ? 'Update Configuration' : 'Add Test Configuration';
                    // Ensure the onclick handler is set correctly
                    if (!submitButton._originalOnClick) {
                        submitButton._originalOnClick = submitButton.onclick;
                    }
                }
                
                if (!categoryEl || !testNameEl || !hoursEl || !minutesEl || !manHoursEl || !manMinutesEl || !powerEl || !techniciansEl) {
                    showAlert('Form elements not found', 'error');
                    return;
                }
                
                const category = categoryEl.value;
                const testName = testNameEl.value;
                const hours = parseInt(hoursEl.value) || 0;
                const minutes = parseInt(minutesEl.value) || 0;
                const cycleTime = hours + (minutes / 60);
                const manHours = (parseInt(manHoursEl.value) || 0) + ((parseInt(manMinutesEl.value) || 0) / 60);
                const machines = labData.selectedMachinesForConfig || []
//   .filter(m => m !== 'No Machine Required');

                const power = parseFloat(powerEl.value);
                const technicians = parseInt(techniciansEl.value);
                const procedure = procedureEl.value;
      // Validate required fields
const missingFields = [];
if (!category) missingFields.push('category');
if (!testName.trim()) missingFields.push('test name');
if (cycleTime === 0) missingFields.push('cycle time');

// If user didn't pick "No Machine Required" from Lab Resources,
// then require at least one real machine.
const hasNoMachineRequired = (labData.selectedMachinesForConfig || []).includes('No Machine Required');
if (!hasNoMachineRequired && (!machines || machines.length === 0)) {
  missingFields.push('at least one machine or select "No Machine Required"');
}

if (!power && power !== 0) missingFields.push('power consumption');
if (!technicians) missingFields.push('number of technicians');

if (missingFields.length > 0) {
    showAlert(`Please fill all required fields: ${missingFields.join(', ')}`, 'warning');
  
    // Highlight missing fields
    if (!category) categoryEl.style.border = '1px solid red';
    if (!testName.trim()) testNameEl.style.border = '1px solid red';
    if (cycleTime === 0) {
      hoursEl.style.border = '1px solid red';
      minutesEl.style.border = '1px solid red';
    }
  
    // NEW: allow "No Machine Required" from Lab Resources
    const sel = labData.selectedMachinesForConfig || [];
    const pickedNoMachine = sel.includes('No Machine Required');
    if (machines.length === 0 && !pickedNoMachine) {
      const machineSelect = document.getElementById('selectedMachines');
      if (machineSelect) machineSelect.style.border = '1px solid red';
    }
  
    if (!power && power !== 0) powerEl.style.border = '1px solid red';
    if (!technicians) techniciansEl.style.border = '1px solid red';
  
    // Remove red border when user interacts with the field
    const removeErrorHighlight = (el) => { if (el) el.style.border = ''; };
    categoryEl.addEventListener('focus', () => removeErrorHighlight(categoryEl));
    testNameEl.addEventListener('focus', () => removeErrorHighlight(testNameEl));
    hoursEl.addEventListener('focus', () => { removeErrorHighlight(hoursEl); removeErrorHighlight(minutesEl); });
    minutesEl.addEventListener('focus', () => { removeErrorHighlight(hoursEl); removeErrorHighlight(minutesEl); });
    powerEl.addEventListener('focus', () => removeErrorHighlight(powerEl));
    techniciansEl.addEventListener('focus', () => removeErrorHighlight(techniciansEl));
  
    // Also clear red border on machine selection change
    const machineSelect = document.getElementById('selectedMachines');
    if (machineSelect) {
      machineSelect.addEventListener('change', () => removeErrorHighlight(machineSelect), { once: true });
    }
  
    return;
  }
  
// Validate man hours vs cycle time logic
if (manHours === 0) {
    showAlert('Man hours cannot be zero. Enter the actual technician time needed.', 'warning');
    return;
    saveMachines();

    saveTechnicians();

}
 
if (manHours > cycleTime) {
    showAlert(`Man hours (${manHours.toFixed(2)}) cannot exceed cycle time (${cycleTime.toFixed(2)}). Man hours represent actual technician work time.`, 'warning');
    return;
}
 
// Add warning for unusual ratios
if (manHours > cycleTime * 0.5) {
    if (!confirm(`Technician will be occupied for ${manHours.toFixed(2)} hours out of ${cycleTime.toFixed(2)} hour test. Is this correct?`)) {
        return;
    }
}
                
                // Prepare specification sets (optional)
                const specificationSets = [];
                // Use window.currentSpecificationSets if available (from edit mode), otherwise use labData.currentSpecificationSets
                const currentSpecSets = window.currentSpecificationSets || (labData.currentSpecificationSets || []);
                
                if (currentSpecSets.length > 0) {
                    currentSpecSets.forEach((set, index) => {
                        if (set.parameters && set.parameters.length > 0) {
                            specificationSets.push({
                                id: set.id || `spec-${Date.now()}-${index}`,
                                name: set.name || `Spec ${index + 1}`,
                                parameters: JSON.parse(JSON.stringify(set.parameters)) // Deep clone parameters
                            });
                        }
                    });
                }
                
                // Check if we're in edit mode
                const isEditMode = window.currentEdit !== undefined && 
                                 window.currentEdit.category && 
                                 window.currentEdit.index !== undefined;
                
                if (isEditMode) {
                    let success = false;
                    try {
                        const { category: originalCategory, index } = window.currentEdit;
                        
                        // If category changed, remove from old category and add to new
                        if (originalCategory !== category) {
                            // Remove from old category
                            const [updatedConfig] = labData.testConfigs[originalCategory].splice(index, 1);
                            
                            // Add to new category
                            if (!labData.testConfigs[category]) {
                                labData.testConfigs[category] = [];
                            }
                            labData.testConfigs[category].push(updatedConfig);
                        }
                        
                        // Update the configuration
                        const configIndex = (originalCategory === category) ? index : labData.testConfigs[category].length - 1;
                        labData.testConfigs[category][configIndex] = {
                            name: testName,
                            cycleTime,
                            manHours,
                            machines,
                            power,
                            technicians,
                            specificationSets,
                            procedure
                        };
                        
                        // Mark as successful
                        success = true;
                        
                        // Reset the form
                        if (submitButton) {
                            submitButton.textContent = 'Add Test Configuration';
                            if (submitButton._originalOnClick) {
                                submitButton.onclick = submitButton._originalOnClick;
                            }
                        }
                        
                        // Clear form fields
                        [categoryEl, testNameEl, hoursEl, minutesEl, manHoursEl, manMinutesEl, powerEl, procedureEl].forEach(el => {
                            if (el) el.value = '';
                        });
                        if (techniciansEl) techniciansEl.value = '1';
                        
                        // Clear specification sets display and data
                        const testSpecSets = document.getElementById('testSpecificationSets');
                        if (testSpecSets) testSpecSets.innerHTML = '';
                        
                        // Clear selected machines
                        labData.selectedMachinesForConfig = [];
                        updateSelectedMachinesDisplay();
                        
                        // Reset edit mode and specification sets
                        delete window.currentEdit;
                        delete window.currentSpecificationSets;
                        
                        // Only show success message if we didn't already show an error
                        if (success) {
                            // Save the updated configurations to localStorage
                            saveTestConfigs();
                            
                            // Update the UI
                            showAlert('Test configuration updated successfully!', 'success');
                            if (typeof updateTestConfigTable === 'function') {
                                updateTestConfigTable();
                            }
                        }
                        return; // Exit the function after successful update
                    } catch (error) {
                        console.error('Error updating test configuration:', error);
                        showAlert('Error updating test configuration', 'error');
                        return;
                    }
                } else {
                    // Add new test configuration
                    if (!labData.testConfigs[category]) {
                        labData.testConfigs[category] = [];
                    }
                    
                    labData.testConfigs[category].push({
                        name: testName,
                        cycleTime,
                        manHours,
                        machines,
                        power,
                        technicians,
                        specificationSets,
                        procedure
                    });
                    
                    showAlert('Test configuration added successfully!', 'success');
                }
                
                updateTestConfigTable();
                
                // Clear form
                [categoryEl, testNameEl, hoursEl, minutesEl, manHoursEl, manMinutesEl, powerEl, procedureEl].forEach(el => {
                    if (el) el.value = '';
                });
                techniciansEl.value = '1';
                
                const testSpecSets = document.getElementById('testSpecificationSets');
                if (testSpecSets) testSpecSets.innerHTML = '';
                
                labData.selectedMachinesForConfig = [];
                labData.currentSpecificationSets = [];
                labData.specSetCounter = 0;
                updateSelectedMachinesDisplay();
            } catch (error) {
                console.error('Test config addition error:', error);
                showAlert('Error adding test configuration', 'error');
            }
        }
        
        function updateTestConfigTable() {
            try {
                const tbody = document.getElementById('testConfigBody');
                if (!tbody) return;
                
                tbody.innerHTML = '';
                
                Object.entries(labData.testConfigs).forEach(([category, tests]) => {
                    tests.forEach((test, index) => {
                        const hours = Math.floor(test.cycleTime);
                        const minutes = Math.round((test.cycleTime - hours) * 60);
                        const manHours = Math.floor(test.manHours || 0);
                        const manMinutes = Math.round(((test.manHours || 0) - manHours) * 60);
                        
                        const specDisplay = test.specificationSets && test.specificationSets.length > 0 
                            ? `${test.specificationSets.length} sets` 
                            : 'No specs';
                        
                        const tr = document.createElement('tr');
                        tr.style.cursor = 'pointer';
                        tr.title = 'Click to view details';
                        tr.onclick = function(e) {
                            // Don't trigger if clicking on buttons
                            if (e.target.tagName !== 'BUTTON') {
                                showTestConfigDetails(category, index);
                            }
                        };
                        
                        // Add hover effect
                        tr.onmouseover = function() {
                            if (!this.classList.contains('editing')) {
                                this.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                            }
                        };
                        
                        tr.onmouseout = function() {
                            if (!this.classList.contains('editing')) {
                                this.style.backgroundColor = '';
                            }
                        };
                        
                        tr.innerHTML = `
                            <td>${category.toUpperCase()}</td>
                            <td>${test.name}</td>
                            <td>${hours}h ${minutes}m</td>
                            <td>${manHours}h ${manMinutes}m</td><td>${test.machines && test.machines.length > 0 ? test.machines.join(', ') : 'No Machine Required'}</td>
                            <td>${test.power}</td>
                            <td>${test.technicians}</td>
                            <td title="${test.specificationSets ? test.specificationSets.map(s => s.name).join(', ') : ''}">${specDisplay}</td>
                            <td class="action-buttons">
                                <button class="btn-secondary" onclick="event.stopPropagation(); editTestConfig('${category}', ${index})" style="margin-right: 5px;">
                                    Edit
                                </button>
                                <button class="btn-danger" onclick="event.stopPropagation(); removeTestConfig('${category}', ${index})">
                                    Remove
                                </button>
                            </td>
                        `;
                        tbody.appendChild(tr);
                    });
                });
            } catch (error) {
                console.error('Test config table update error:', error);
            }
        }
        
        function removeTestConfig(category, index) {
            try {
                if (confirm('Are you sure you want to remove this test configuration? This action cannot be undone.')) {
                    if (labData.testConfigs[category]) {
                        labData.testConfigs[category].splice(index, 1);
                        updateTestConfigTable();
                        showAlert('Test configuration removed', 'info');
                    }
                }
            } catch (error) {
                console.error('Test config removal error:', error);
                showAlert('Error removing test configuration', 'error');
            }
        }
        
        // Specification Set Functions
        function addSpecificationSet() {
            try {
                const container = document.getElementById('testSpecificationSets');
                if (!container) {
                    console.error('Could not find testSpecificationSets container');
                    return;
                }

                const setId = 'set_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                const tempName = `New Specification Set ${(labData.currentSpecificationSets?.length || 0) + 1}`;
                
                // Create the set in our data model with empty parameters
                const newSet = {
                    id: setId,
                    name: tempName,
                    parameters: []
                };
                
                // Add to our data model
                labData.currentSpecificationSets = labData.currentSpecificationSets || [];
                labData.currentSpecificationSets.push(newSet);
                
                // Create the set container
                const setContainer = document.createElement('div');
                setContainer.className = 'spec-set-container';
                setContainer.id = setId;
                setContainer.style.marginBottom = '20px';
                setContainer.style.padding = '15px';
                setContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
                setContainer.style.borderRadius = '8px';
                setContainer.style.border = '1px solid #444';
                
                setContainer.innerHTML = `
                    <div class="spec-set-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <input type="text" id="${setId}-name" 
                               value="${tempName}" 
                               placeholder="Specification Set Name"
                               style="background: rgba(255, 255, 255, 0.1); 
                                      color: #ffd700; 
                                      border: 1px solid #555; 
                                      padding: 5px 10px; 
                                      border-radius: 4px;
                                      flex: 1;
                                      margin-right: 10px;">
                        <div>
                            <button onclick="saveSpecificationSet('${setId}')" 
                                    class="btn-secondary" 
                                    style="margin-right: 5px;">
                                Save
                            </button>
                            <button onclick="removeSpecificationSet('${setId}')" 
                                    class="btn-danger">
                                Cancel
                            </button>
                        </div>
                    </div>
                    <div class="spec-set-params" id="${setId}-params" 
                         style="margin-bottom: 15px; max-height: 200px; overflow-y: auto;">
                        <!-- Parameters will be added here -->
                    </div>
                    <div class="spec-param-input" style="display: none; margin-top: 10px;">
                        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                            <input type="text" 
                                   id="${setId}-param-name" 
                                   placeholder="Parameter name" 
                                   style="flex: 1;">
                            <input type="text" 
                                   id="${setId}-param-value" 
                                   placeholder="Value" 
                                   style="flex: 1;">
                        </div>
                        <div>
                            <button onclick="addParameterToSet('${setId}')" 
                                    class="btn-secondary">
                                Add Parameter
                            </button>
                            <button onclick="toggleParameterInput('${setId}', false)" 
                                    class="btn-danger" 
                                    style="margin-left: 5px;">
                                Cancel
                            </button>
                        </div>
                    </div>
                    <button onclick="toggleParameterInput('${setId}')" 
                            class="btn-secondary" 
                            style="margin-top: 10px;">
                        + Add Parameter
                    </button>
                `;
                
                // Add the new set to the UI
                container.appendChild(setContainer);
                
                // Focus on the name input
                const nameInput = document.getElementById(`${setId}-name`);
                if (nameInput) {
                    nameInput.select();
                }
                
            } catch (error) {
                console.error('Error adding specification set:', error);
                showAlert('Error creating new specification set', 'error');
            }
        }
        
        function saveSpecificationSet(setId) {
            try {
                const nameInput = document.getElementById(`${setId}-name`);
                if (!nameInput) return;
                
                const setName = nameInput.value.trim() || `Specification Set`;
                
                // Update the set name in our data model
                const set = labData.currentSpecificationSets.find(s => s.id === setId);
                if (set) {
                    set.name = setName;
                    showAlert('Specification set saved', 'success');
                }
                
            } catch (error) {
                console.error('Error saving specification set:', error);
                showAlert('Error saving specification set', 'error');
            }
        }
        
        function toggleParameterInput(setId, show = null) {
            const inputContainer = document.querySelector(`#${setId} .spec-param-input`);
            if (!inputContainer) return;
            
            if (show === null) {
                // Toggle visibility
                inputContainer.style.display = inputContainer.style.display === 'none' ? 'block' : 'none';
            } else {
                // Set specific visibility
                inputContainer.style.display = show ? 'block' : 'none';
            }
        }
        
        function addParameterToSet(setId) {
            try {
                const nameInput = document.getElementById(`${setId}-param-name`);
                const valueInput = document.getElementById(`${setId}-param-value`);
                
                if (!nameInput || !valueInput) {
                    console.error('Input elements not found');
                    return;
                }
                
                const paramName = nameInput.value.trim();
                const paramValue = valueInput.value.trim();
                
                if (!paramName || !paramValue) {
                    showAlert('Please enter both parameter name and value', 'warning');
                    return;
                }
                
                // Find the set in our data model
                const set = labData.currentSpecificationSets.find(s => s.id === setId);
                if (!set) {
                    console.error('Specification set not found:', setId);
                    return;
                }
                
                // Create a unique ID for the parameter
                const paramId = 'param_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                
                // Add parameter to our data model
                set.parameters = set.parameters || [];
                set.parameters.push({
                    id: paramId,
                    name: paramName,
                    value: paramValue
                });
                
                // Add parameter to the UI
                const paramContainer = document.getElementById(`${setId}-params`);
                if (paramContainer) {
                    const paramItem = document.createElement('div');
                    paramItem.className = 'spec-set-param-item';
                    paramItem.id = paramId;
                    paramItem.style.marginBottom = '5px';
                    paramItem.style.display = 'flex';
                    paramItem.style.justifyContent = 'space-between';
                    paramItem.style.alignItems = 'center';
                    paramItem.style.padding = '5px';
                    paramItem.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    paramItem.style.borderRadius = '4px';
                    
                    paramItem.innerHTML = `
                        <span style="color: #ffd700;">${paramName}: ${paramValue}</span>
                        <button onclick="removeParameterFromSet('${setId}', '${paramId}')" 
                                class="btn-danger" 
                                style="padding: 3px 8px; font-size: 12px;">
                            Remove
                        </button>
                    `;
                    
                    paramContainer.appendChild(paramItem);
                }
                
                // Clear inputs but keep the form open for adding more parameters
                nameInput.value = '';
                valueInput.value = '';
                nameInput.focus(); // Focus back to name input for next parameter
                
                // Show success message
                showAlert('Parameter added successfully', 'success');
            } catch (error) {
                console.error('Parameter addition error:', error);
                showAlert('Error adding parameter', 'error');
            }
        }
        
        function removeParameterFromSet(setId, paramId) {
            try {
                // Find the set in our data model
                const set = labData.currentSpecificationSets.find(s => s.id === setId);
                if (!set) {
                    console.error('Set not found:', setId);
                    return;
                }
                
                // Remove parameter from data model
                set.parameters = set.parameters.filter(p => p.id !== paramId);
                
                // Remove from UI
                const paramElement = document.getElementById(paramId);
                if (paramElement) {
                    paramElement.remove();
                }
            } catch (error) {
                console.error('Parameter removal error:', error);
            }
        }
        
        function editSpecificationSet(setId) {
            try {
                console.log('Editing specification set:', setId);
                console.log('Current specification sets:', window.currentSpecificationSets);
                
                // Ensure currentSpecificationSets is initialized
                window.currentSpecificationSets = window.currentSpecificationSets || [];
                
                // Find the set in our data model
                const setToEdit = window.currentSpecificationSets.find(set => set && set.id === setId);
                if (!setToEdit) {
                    console.error('Could not find specification set to edit. Set ID:', setId);
                    console.error('Available sets:', window.currentSpecificationSets);
                    showAlert('Error: Could not find specification set to edit', 'error');
                    return;
                }

                // Create a modal for editing
                const modalId = 'editSpecModal';
                let modal = document.getElementById(modalId);
                
                // Remove existing modal if it exists
                if (modal) {
                    document.body.removeChild(modal);
                }
                
                // Create new modal
                modal = document.createElement('div');
                modal.id = modalId;
                modal.style.position = 'fixed';
                modal.style.top = '0';
                modal.style.left = '0';
                modal.style.width = '100%';
                modal.style.height = '100%';
                modal.style.backgroundColor = 'rgba(0,0,0,0.8)';
                modal.style.display = 'flex';
                modal.style.justifyContent = 'center';
                modal.style.alignItems = 'center';
                modal.style.zIndex = '1000';
                
                // Create modal content
                const modalContent = document.createElement('div');
                modalContent.style.backgroundColor = '#1e1e1e';
                modalContent.style.padding = '20px';
                modalContent.style.borderRadius = '8px';
                modalContent.style.width = '80%';
                modalContent.style.maxWidth = '600px';
                modalContent.style.maxHeight = '80vh';
                modalContent.style.overflowY = 'auto';
                
                // Create form for editing
                modalContent.innerHTML = `
                    <h3 style="color: #ffd700; margin-top: 0;">Edit Specification Set</h3>
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; color: #ffd700;">Set Name:</label>
                        <input type="text" id="editSetName" value="${setToEdit.name || ''}" 
                               style="width: 100%; padding: 8px; background: #2d2d2d; border: 1px solid #444; color: #fff; border-radius: 4px;">
                    </div>
                    <div id="editParametersContainer" style="margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 10px; align-items: center;">
                            <h4 style="color: #ffd700; margin: 0;">Parameters</h4>
                            <button type="button" onclick="addParameterToEditForm('${setId}')" 
                                    class="btn-secondary" style="padding: 5px 10px;">
                                + Add Parameter
                            </button>
                        </div>
                        ${(setToEdit.parameters || []).map((param, paramIndex) => `
                            <div class="param-row" style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
                                <input type="text" placeholder="Parameter name" 
                                       value="${param.name || ''}" 
                                       class="param-name" 
                                       style="flex: 2; padding: 5px; background: #2d2d2d; border: 1px solid #444; color: #fff; border-radius: 4px;">
                                <input type="text" placeholder="Value" 
                                       value="${param.value || ''}" 
                                       class="param-value" 
                                       style="flex: 1; padding: 5px; background: #2d2d2d; border: 1px solid #444; color: #fff; border-radius: 4px;">
                                <input type="text" placeholder="Unit (optional)" 
                                       value="${param.unit || ''}" 
                                       class="param-unit" 
                                       style="flex: 1; padding: 5px; background: #2d2d2d; border: 1px solid #444; color: #fff; border-radius: 4px;">
                                <button type="button" onclick="this.closest('.param-row').remove()" 
                                        class="btn-danger" style="padding: 5px 10px;">
                                    Remove
                                </button>
                            </div>
                        `).join('')}
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 10px;">
                        <button type="button" onclick="document.body.removeChild(document.getElementById('${modalId}'))" 
                                class="btn-secondary" style="padding: 8px 16px;">
                            Cancel
                        </button>
                        <button type="button" onclick="saveEditedSpecificationSet('${setId}')" 
                                class="btn-primary" style="padding: 8px 16px;">
                            Save Changes
                        </button>
                    </div>
                `;
                
                modal.appendChild(modalContent);
                document.body.appendChild(modal);
                
            } catch (error) {
                console.error('Error in editSpecificationSet:', error);
                showAlert('Error opening editor for specification set', 'error');
            }
        }
        
        function addParameterToEditForm() {
            const container = document.getElementById('editParametersContainer');
            if (!container) return;
            
            const paramRow = document.createElement('div');
            paramRow.className = 'param-row';
            paramRow.style.display = 'flex';
            paramRow.style.gap = '10px';
            paramRow.style.marginBottom = '10px';
            paramRow.style.alignItems = 'center';
            
            paramRow.innerHTML = `
                <input type="text" placeholder="Parameter name" 
                       class="param-name" 
                       style="flex: 2; padding: 5px; background: #2d2d2d; border: 1px solid #444; color: #fff; border-radius: 4px;">
                <input type="text" placeholder="Value" 
                       class="param-value" 
                       style="flex: 1; padding: 5px; background: #2d2d2d; border: 1px solid #444; color: #fff; border-radius: 4px;">
                <input type="text" placeholder="Unit (optional)" 
                       class="param-unit" 
                       style="flex: 1; padding: 5px; background: #2d2d2d; border: 1px solid #444; color: #fff; border-radius: 4px;">
                <button type="button" onclick="this.closest('.param-row').remove()" 
                        class="btn-danger" style="padding: 5px 10px;">
                    Remove
                </button>
            `;
            
            // Insert before the last element (which is the buttons div)
            container.insertBefore(paramRow, container.lastElementChild);
        }
        
        function saveEditedSpecificationSet(setId) {
            try {
                const setName = document.getElementById('editSetName').value.trim();
                if (!setName) {
                    showAlert('Please enter a name for the specification set', 'warning');
                    return;
                }
                
                // Collect all parameters
                const paramRows = document.querySelectorAll('#editParametersContainer .param-row');
                const parameters = [];
                
                paramRows.forEach(row => {
                    const name = row.querySelector('.param-name').value.trim();
                    const value = row.querySelector('.param-value').value.trim();
                    const unit = row.querySelector('.param-unit').value.trim();
                    
                    if (name && value) {
                        parameters.push({
                            name,
                            value,
                            unit: unit || undefined
                        });
                    }
                });
                
                if (parameters.length === 0) {
                    showAlert('Please add at least one parameter', 'warning');
                    return;
                }
                
                // Update the set in our data model
                const setIndex = window.currentSpecificationSets.findIndex(set => set && set.id === setId);
                if (setIndex === -1) {
                    throw new Error('Could not find specification set to update');
                }
                
                // Update the specification set
                window.currentSpecificationSets[setIndex] = {
                    ...window.currentSpecificationSets[setIndex],
                    name: setName,
                    parameters: [...parameters] // Store a copy of the parameters array
                };
                
                console.log('Updated specification set:', window.currentSpecificationSets[setIndex]);
                
                // Close the modal
                const modal = document.getElementById('editSpecModal');
                if (modal) {
                    document.body.removeChild(modal);
                }
                
                // Update the display
                updateSpecificationSetDisplay(setId, { name: setName, parameters });
                
                showAlert('Specification set updated successfully', 'success');
                
            } catch (error) {
                console.error('Error saving specification set:', error);
                showAlert('Error saving specification set: ' + error.message, 'error');
            }
        }
        
        function updateSpecificationSetDisplay(setId, setData) {
            const setElement = document.getElementById(setId);
            if (!setElement) return;
            
            // Update the set name in the display
            const nameElement = setElement.querySelector('h4');
            if (nameElement) {
                nameElement.textContent = setData.name || 'Unnamed Set';
            }
            
            // Update parameters display
            const paramsContainer = setElement.querySelector('.spec-parameters');
            if (paramsContainer) {
                paramsContainer.innerHTML = (setData.parameters || []).map(param => `
                    <div class="spec-param">
                        <span class="param-name">${param.name}:</span>
                        <span class="param-value">${param.value} ${param.unit || ''}</span>
                    </div>
                `).join('');
            }
        }
        
        function removeSpecificationSet(setId, confirmFirst = true) {
            try {
                if (confirmFirst && !confirm('Are you sure you want to remove this specification set?')) {
                    return;
                }
                
                // Remove from data model
                labData.currentSpecificationSets = (labData.currentSpecificationSets || []).filter(s => s.id !== setId);
                
                // Remove from UI
                const setElement = document.getElementById(setId);
                if (setElement) {
                    setElement.remove();
                }
            } catch (error) {
                console.error('Specification set removal error:', error);
            }
        }
        
        // Machine selector functions
// Machine selector functions
function openMachineSelector() {
    try {
      const modal = document.getElementById('machineSelectorModal');
      const content = document.getElementById('machineSelectorContent');
      if (!modal || !content) return;
  
      loadMachines();
  
      if (!labData.selectedMachinesForConfig) {
        labData.selectedMachinesForConfig = [];
      }
  
      if (labData.machines.length === 0) {
        content.innerHTML = '<p>No machines available. Please add machines in Lab Resources first.</p>';
      } else {
        // Build unique machine types from Lab Resources
        const machineTypes = (labData.machines || []).map(m => m.type).filter(Boolean);
        // Use Set to ensure uniqueness, including "No Machine Required"
        const uniqueMachineTypes = Array.from(new Set([...machineTypes, "No Machine Required"]));

        
  
        content.innerHTML = `
          <div style="max-height: 60vh; overflow-y: auto; padding-right: 10px;">
            <div class="checkbox-group" style="margin-bottom: 25px;">
              <div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #e0e0e0;">
                <h3 style="margin: 0 0 10px 0; color: #ffd700;">Select Required Machines</h3>
                <p style="margin: 5px 0 0 0; color: #aaa; font-size: 0.9em; font-weight: bold;">
                  Select the machines needed for this test. If none are needed, choose the Lab Resources entry
                  "No Machine Required" (if available).
                </p>
              </div>
  
              <div style="margin: 15px 0;" id="machineSelectionContainer">
                <div style="font-weight: 600; margin-bottom: 10px; color: #34495e; display: flex; align-items: center;">
                  <i class="fas fa-tools" style="margin-right: 8px; color: #ffd700;"></i>
                  <span style="color: #ffd700;">Standard Machines</span>
                </div>
  
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px;">
                  ${uniqueMachineTypes.map(type => {
                    const isChecked = labData.selectedMachinesForConfig.includes(type) ? 'checked' : '';
                    return `
                      <label class="checkbox-label" style="display: flex; align-items: center; padding: 8px 12px; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; transition: all 0.2s; height: 40px;"
                             onmouseover="this.style.background='#333'"
                             onmouseout="this.style.background='#2a2a2a'">
                        <input type="checkbox" value="${type}" ${isChecked}
                               style="margin: 0 10px 0 0; width: 16px; height: 16px; flex-shrink: 0;" class="machine-checkbox">
                        <span style="color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${type}</span>
                      </label>
                    `;
                  }).join('')}
                </div>
              </div>
  
              <div style="display:flex; gap:10px; justify-content:flex-end; margin-top: 16px;">
                <button id="confirmSelectionBtn" class="btn-success" type="button">Confirm</button>
                <button class="btn-secondary" type="button" onclick="closeMachineSelector()">Cancel</button>
              </div>
            </div>
          </div>
        `;
  
        // Confirm handler: collect only checked machine types (no NIL logic)
        const confirmBtn = document.getElementById('confirmSelectionBtn');
        confirmBtn.addEventListener('click', () => {
          const machineCheckboxes = document.querySelectorAll('.machine-checkbox');
          const noMachineRequired = Array.from(machineCheckboxes).find(checkbox => 
            checkbox.value.toLowerCase() === 'no machine required' && checkbox.checked
        );
    
          let selected = [];
          if (noMachineRequired) {
            // If "NO MACHINE REQUIRED" is checked, only add that
            selected = ['No Machine Required'];
        } else {
            // Otherwise, add all checked machines
            machineCheckboxes.forEach(cb => { 
                if (cb.checked) selected.push(cb.value); 
            });
        }
        
        labData.selectedMachinesForConfig = selected;
        updateSelectedMachinesDisplay();
        closeMachineSelector();
    }, { once: true });
      }
      modal.style.display = 'flex';
    } catch (error) {
      console.error('openMachineSelector error:', error);
    }
  }
  function handleMachineCheckboxChange(event) {
    const checkboxes = document.querySelectorAll('.machine-checkbox');
    const noMachineRequired = Array.from(checkboxes).find(checkbox => 
      checkbox.value.toLowerCase() === 'no machine required'
    );
  
    // If "NO MACHINE REQUIRED" was checked
    if (event.target === noMachineRequired && event.target.checked) {
      checkboxes.forEach(checkbox => {
        if (checkbox !== noMachineRequired) {
          checkbox.checked = false;
        }
      });
    }
    // If any other checkbox is checked
    else if (event.target.checked) {
      if (noMachineRequired) {
        noMachineRequired.checked = false;
      }
    }
  }
  
  // Then, in your openMachineSelector function, after creating the checkboxes, add:
  const machineCheckboxes = document.querySelectorAll('.machine-checkbox');
  machineCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', handleMachineCheckboxChange);
  });       
// Replace your confirmMachineSelection() with this
function confirmMachineSelection() {
    try {
      const machineCheckboxes = document.querySelectorAll('.machine-checkbox');
      const selectedMachines = [];
      machineCheckboxes.forEach(cb => { if (cb.checked) selectedMachines.push(cb.value); });
  
      // Save selection
      labData.selectedMachinesForConfig = selectedMachines;
  
      updateSelectedMachinesDisplay();
      closeMachineSelector();
    } catch (error) {
      console.error('Machine selection confirmation error:', error);
      showAlert('Error confirming machine selection', 'error');
    }
  }
  
        
// Replace your updateSelectedMachinesDisplay() with this
function updateSelectedMachinesDisplay() {
    try {
        const container = document.getElementById('selectedMachines');
        if (!container) {
            console.error('Could not find element with ID "selectedMachines"');
            // Try to find the container in the modal
            const modal = document.querySelector('.test-config-form');
            if (modal) {
                const newContainer = document.createElement('div');
                newContainer.id = 'selectedMachines';
                modal.insertBefore(newContainer, modal.firstChild);
                updateSelectedMachinesDisplay(); // Retry with the new container
                return;
            }
            return;
        }

        const sel = Array.isArray(labData.selectedMachinesForConfig) 
            ? labData.selectedMachinesForConfig 
            : ['No Machine Required'];

        if (sel.length === 0 || (sel.length === 1 && sel[0] === 'No Machine Required')) {
            container.innerHTML = `
                <span class="machine-tag" style="background: #2a2a2a; color: #fff; padding: 5px 10px; 
                       border-radius: 4px; display: inline-flex; align-items: center; margin: 2px;">
                    No Machine Required
                </span>`;
            return;
        }

        container.innerHTML = sel.map(machine => `
            <span class="machine-tag" style="background: #2a2a2a; color: #fff; padding: 5px 10px; 
                   border-radius: 4px; display: inline-flex; align-items: center; margin: 2px;">
                ${machine}
                ${machine !== 'No Machine Required' ? 
                    `<span onclick="event.stopPropagation(); removeMachineFromSelection('${machine}')" 
                          class="remove-machine" 
                          style="margin-left: 8px; cursor: pointer; color: #ff6b6b; font-weight: bold;">
                     ×
                    </span>` : ''}
            </span>
        `).join('');
    } catch (error) {
        console.error('Selected machines display update error:', error);
    }
}
  
        
        function removeMachineFromSelection(machineType) {
            try {
                labData.selectedMachinesForConfig = labData.selectedMachinesForConfig.filter(m => m !== machineType);
                updateSelectedMachinesDisplay();
            } catch (error) {
                console.error('Machine removal from selection error:', error);
            }
        }
        
        function closeMachineSelector() {
            try {
                const modal = document.getElementById('machineSelectorModal');
                if (modal) modal.style.display = 'none';
            } catch (error) {
                console.error('Machine selector closing error:', error);
            }
        }
        
        // Life cycle testing functions
        function addToLifecycle(productId, productData) {
            try {
                const lifecycleItem = {
                    id: productId,
                    productType: productData.productType,
                    productClass: productData.productClass,
                    modelName: productData.modelName,
                    startTime: new Date(),
                    elapsedSeconds: 0,
                    isPaused: true,
                    cyclesCompleted: 0
                };
                
                labData.lifecycleProducts.push(lifecycleItem);
                
                // Start timer for this product
                labData.lifecycleTimers[productId] = setInterval(() => {
                    const item = labData.lifecycleProducts.find(p => p.id === productId);
                    if (item && !item.isPaused) {
                        item.elapsedSeconds++;
                        // Calculate cycles based on elapsed time and cycle time config
                        const cycleTimeMinutes = labData.lifecycleConfig[item.productType]?.cycleTimeMinutes || 60;
                        const cycleTimeSeconds = cycleTimeMinutes * 60;
                        item.cyclesCompleted = Math.floor(item.elapsedSeconds / cycleTimeSeconds);
                        
                        if (document.getElementById('lifecycle').classList.contains('active')) {
                            updateLifecycleDisplay();
                        }
                    }
                }, 1000);
                
                updateLifecycleDisplay();
                showAlert(`${productId} added to life cycle testing (paused)`, 'success');
            } catch (error) {
                console.error('Lifecycle addition error:', error);
                showAlert('Error adding to lifecycle testing', 'error');
            }
        }
        
        function toggleLifecycleTimer(productId) {
            try {
                const product = labData.lifecycleProducts.find(p => p.id === productId);
                if (product) {
                    product.isPaused = !product.isPaused;
                    updateLifecycleDisplay();
                }
            } catch (error) {
                console.error('Lifecycle timer toggle error:', error);
            }
        }
        
        function removeFromLifecycle(productId) {
            try {
                if (labData.lifecycleTimers[productId]) {
                    clearInterval(labData.lifecycleTimers[productId]);
                    delete labData.lifecycleTimers[productId];
                }
                
                labData.lifecycleProducts = labData.lifecycleProducts.filter(p => p.id !== productId);
                updateLifecycleDisplay();
                showAlert(`${productId} removed from life cycle testing`, 'info');
            } catch (error) {
                console.error('Lifecycle removal error:', error);
                showAlert('Error removing from lifecycle testing', 'error');
            }
        }
        
        function updateLifecycleDisplay() {
            try {
                const container = document.getElementById('lifecycleProducts');
                if (!container) return;
                
                if (labData.lifecycleProducts.length === 0) {
                    container.innerHTML = '<p style="color: #888;">No products currently in life cycle testing</p>';
                    return;
                }
                
                container.innerHTML = labData.lifecycleProducts.map(product => {
                    const cycleTimeMinutes = labData.lifecycleConfig[product.productType]?.cycleTimeMinutes || 60;
                    const currentCycleProgress = product.elapsedSeconds % (cycleTimeMinutes * 60);
                    const progressPercent = (currentCycleProgress / (cycleTimeMinutes * 60)) * 100;
                    
                    return `
                        <div class="lifecycle-item">
                            <div>
                                <h4>${product.id}</h4>
                                <p style="color: #888;">
                                    Type: ${product.productType.toUpperCase()} | 
                                    Class: ${product.productClass} | 
                                    Started: ${formatDateTime(product.startTime)}
                                </p>
                                <div class="progress-bar" style="width: 300px; margin-top: 10px;">
                                    <div class="progress-fill" style="width: ${progressPercent}%"></div>
                                </div>
                                <p style="color: #888; font-size: 0.85rem; margin-top: 5px;">
                                    Current cycle progress: ${Math.floor(currentCycleProgress / 60)}m ${currentCycleProgress % 60}s / ${cycleTimeMinutes}m
                                </p>
                            </div>
                            <div style="text-align: right;">
                                <div class="lifecycle-cycles">
                                    Cycles: ${product.cyclesCompleted}
                                </div>
                                <div style="color: ${product.isPaused ? '#ff9800' : '#81c784'}; margin: 10px 0;">
                                    ${product.isPaused ? '⏸ PAUSED' : '▶ RUNNING'}
                                </div>
                                <div class="lifecycle-controls">
                                    <button onclick="toggleLifecycleTimer('${product.id}')" 
                                            class="${product.isPaused ? 'btn-success' : 'btn-secondary'}" 
                                            style="padding: 8px 16px;">
                                        ${product.isPaused ? 'Start' : 'Pause'}
                                    </button>
                                    <button onclick="removeFromLifecycle('${product.id}')" 
                                            class="btn-danger" 
                                            style="padding: 8px 16px;">
                                        Remove
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            } catch (error) {
                console.error('Lifecycle display update error:', error);
            }
        }
        
        // Initialize lifecycle configuration UI
        function initializeLifecycleConfig() {
            try {
                const container = document.getElementById('lifecycleConfigContainer');
                if (!container) return;
                
                container.innerHTML = '';
                
                labData.productCategories.forEach(category => {
                    const configItem = document.createElement('div');
                    configItem.className = 'lifecycle-config-item';
                    configItem.innerHTML = `
                        <label>${category.toUpperCase()}</label>
                        <input type="number" id="lifecycle-${category}-time" 
                               value="${labData.lifecycleConfig[category]?.cycleTimeMinutes || 60}" 
                               min="1" placeholder="60">
                        <span style="color: #888;">minutes per cycle</span>
                        <button onclick="updateLifecycleCycleTime('${category}')" class="btn-secondary">Update</button>
                    `;
                    container.appendChild(configItem);
                });
            } catch (error) {
                console.error('Lifecycle config initialization error:', error);
            }
        }
        
        // Update lifecycle cycle time
        function updateLifecycleCycleTime(category) {
            try {
                const input = document.getElementById(`lifecycle-${category}-time`);
                if (!input) return;
                
                const cycleTime = parseInt(input.value) || 60;
                if (!labData.lifecycleConfig[category]) {
                    labData.lifecycleConfig[category] = {};
                }
                labData.lifecycleConfig[category].cycleTimeMinutes = cycleTime;
                
                // Update display for any active products of this category
                labData.lifecycleProducts.forEach(product => {
                    if (product.productType === category) {
                        updateLifecycleDisplay();
                    }
                });
                
                showAlert(`Cycle time updated for ${category.toUpperCase()}`, 'success');
            } catch (error) {
                console.error('Lifecycle cycle time update error:', error);
                showAlert('Failed to update cycle time', 'error');
            }
        }
        
        // Show alert/notification
        function showAlert(message, type = 'info') {
            try {
                // Create alert container if it doesn't exist
                let alertContainer = document.getElementById('alertContainer');
                if (!alertContainer) {
                    alertContainer = document.createElement('div');
                    alertContainer.id = 'alertContainer';
                    alertContainer.style.position = 'fixed';
                    alertContainer.style.top = '20px';
                    alertContainer.style.right = '20px';
                    alertContainer.style.zIndex = '1000';
                    document.body.appendChild(alertContainer);
                }
                
                // Create alert element
                const alert = document.createElement('div');
                alert.className = `alert alert-${type}`;
                alert.style.padding = '12px 20px';
                alert.style.marginBottom = '10px';
                alert.style.borderRadius = '4px';
                alert.style.color = '#fff';
                alert.style.opacity = '0';
                alert.style.transition = 'opacity 0.3s';
                
                // Set background color based on type
                const colors = {
                    success: '#4CAF50',
                    error: '#f44336',
                    warning: '#ff9800',
                    info: '#2196F3'
                };
                alert.style.backgroundColor = colors[type] || colors.info;
                
                alert.textContent = message;
                alertContainer.appendChild(alert);
                
                // Fade in
                setTimeout(() => {
                    alert.style.opacity = '1';
                }, 10);
                
                // Auto-remove after delay
                setTimeout(() => {
                    alert.style.opacity = '0';
                    setTimeout(() => {
                        alert.remove();
                    }, 300);
                }, 3000);
                
            } catch (error) {
                console.error('Error showing alert:', error);
                // Fallback to browser alert if custom alert fails
                window.alert(`${type.toUpperCase()}: ${message}`);
            }
        }
        
        // Product Category Management
        function updateProductDropdowns() {
            try {
                const productSelect = document.getElementById('productType');
                const configSelect = document.getElementById('configCategory');
                
                if (productSelect) {
                    productSelect.innerHTML = '<option value="">Select Product</option>';
                    labData.productCategories.forEach(cat => {
                        productSelect.innerHTML += `<option value="${cat}">${cat.toUpperCase()}</option>`;
                    });
                }
                
                if (configSelect) {
                    configSelect.innerHTML = '<option value="">Select Category</option>';
                    labData.productCategories.forEach(cat => {
                        configSelect.innerHTML += `<option value="${cat}">${cat.toUpperCase()}</option>`;
                    });
                }
            } catch (error) {
                console.error('Product dropdown update error:', error);
            }
        }
        
        function addProductCategory() {
            console.log('addProductCategory called');
            try {
                console.log('Getting new category input...');
                const newCatInput = document.getElementById('newCategory');
                console.log('Input element:', newCatInput);
                if (!newCatInput) {
                    console.error('Could not find newCategory input');
                    return;
                }
                
                const newCat = newCatInput.value.trim().toLowerCase();
                console.log('New category value:', newCat);
                
                if (!newCat) {
                    console.log('No category name entered');
                    showAlert('Please enter a category name', 'warning');
                    return;
                }
                
                console.log('Current product categories:', labData.productCategories);
                if (labData.productCategories.includes(newCat)) {
                    console.log('Category already exists:', newCat);
                    showAlert('Category already exists', 'error');
                    return;
                }
                
                console.log('Adding new category...');
                labData.productCategories.push(newCat);
                saveProductCategories(); // Save to localStorage
                console.log('Updated product categories:', labData.productCategories);
                
                // Initialize test configs for new category
                if (!labData.testConfigs) {
                    console.log('Initializing testConfigs object');
                    labData.testConfigs = {};
                }
                labData.testConfigs[newCat] = [];
                
                // Initialize lifecycle config
                if (!labData.lifecycleConfig) {
                    console.log('Initializing lifecycleConfig object');
                    labData.lifecycleConfig = {};
                }
                if (!labData.lifecycleConfig[newCat]) {
                    console.log('Initializing lifecycle config for new category');
                    labData.lifecycleConfig[newCat] = { cycleTimeMinutes: 60 };
                }
                
                console.log('Updating UI...');
                updateProductDropdowns();
                
                if (typeof initializeLifecycleConfig === 'function') {
                    console.log('Initializing lifecycle config...');
                    initializeLifecycleConfig();
                } else {
                    console.error('initializeLifecycleConfig is not a function');
                }
                
                newCatInput.value = '';
                console.log('Showing success message');
                showAlert('Category added successfully', 'success');
                
            } catch (error) {
                console.error('Product category addition error:', error);
                showAlert('Error adding category: ' + error.message, 'error');
            }
        }
        
        function removeProductCategory() {
            try {
                const productSelect = document.getElementById('productType');
                if (!productSelect) return;
                
                const selected = productSelect.value;
                if (!selected) {
                    showAlert('Please select a category to remove', 'warning');
                    return;
                }
                
                if (confirm(`Remove category "${selected.toUpperCase()}" and all its test configurations?`)) {
                    labData.productCategories = labData.productCategories.filter(cat => cat !== selected);
                    delete labData.testConfigs[selected];
                    delete labData.lifecycleConfig[selected];
                    saveProductCategories(); // Save to localStorage
                    updateProductDropdowns();
                    initializeLifecycleConfig();
                    updateTestConfigTable();
                    showAlert('Category removed successfully', 'success');
                }
            } catch (error) {
                console.error('Product category removal error:', error);
                showAlert('Error removing category', 'error');
            }
        }
        
        // Utility Functions
        function updateAllTables() {
            try {
                updateTestConfigTable();
                updateMachineTable();
                updateTechnicianTable();
            } catch (error) {
                console.error('All tables update error:', error);
            }
        }
        
        // Clear test configurations and refresh
        function clearTestConfigsAndRefresh() {
            if (confirm('This will clear all test configurations and refresh the page. Continue?')) {
                localStorage.removeItem('testConfigs');
                location.reload();
            }
        }
        
        // Clean up UPS from lifecycle configuration
        function cleanupUPSFromLifecycle() {
            if (!labData.lifecycleConfig) return;
            
            // Remove all variations of UPS (case-insensitive)
            const upsKeys = Object.keys(labData.lifecycleConfig).filter(key => 
                key.toLowerCase().includes('ups')
            );
            
            upsKeys.forEach(key => {
                console.log('Removing UPS variant from lifecycle config:', key);
                delete labData.lifecycleConfig[key];
            });
        }
        
        // Clean up lifecycle configurations
        function cleanupLifecycleConfigs() {
            if (!labData.lifecycleConfig) return;
            
            // Clean up UPS entries first
            cleanupUPSFromLifecycle();
            
            // Remove any lifecycle configs for categories that don't exist in productCategories
            Object.keys(labData.lifecycleConfig).forEach(category => {
                if (labData.productCategories && !labData.productCategories.includes(category) && category !== 'Modular Switches') {
                    console.log('Removing lifecycle config for non-existent category:', category);
                    delete labData.lifecycleConfig[category];
                }
            });
            
            // Ensure Modular Switches has the correct case
            if (labData.lifecycleConfig['modular switches'] && !labData.lifecycleConfig['Modular Switches']) {
                labData.lifecycleConfig['Modular Switches'] = labData.lifecycleConfig['modular switches'];
                delete labData.lifecycleConfig['modular switches'];
            }
            
            console.log('Current lifecycle config after cleanup:', Object.keys(labData.lifecycleConfig));
        }

        // Initialize the application
        function init() {
            try {
                console.log('Initializing application...');
                
                // Initialize testConfigs if it doesn't exist
                if (!labData.testConfigs) {
                    console.log('Initializing testConfigs object');
                    labData.testConfigs = {};
                }
                
                // Load any saved test configs from localStorage
                console.log('Loading test configs from localStorage...');
                loadTestConfigs();
                console.log('Test configs after loading from localStorage:', Object.keys(labData.testConfigs));
                
                console.log('labData before initializeDefaultConfigs:', JSON.stringify(labData, null, 2));
                
                // Initialize default configurations if none exist
                if (Object.keys(labData.testConfigs).length === 0) {
                    console.log('No test configurations found, initializing defaults');
                    initializeDefaultConfigs();
                    console.log('Test configurations after initialization:', Object.keys(labData.testConfigs));
                    console.log('Modular switches configs:', labData.testConfigs['modular switches']);
                } else {
                    console.log('Using existing test configurations');
                    console.log('Available test categories:', Object.keys(labData.testConfigs));
                    console.log('Modular switches configs:', labData.testConfigs['modular switches']);
                }
                
                // Debug: Log labData after initializeDefaultConfigs
                console.log('labData after initialization:', JSON.stringify(labData, null, 2));
                (function cleanupNoMachineRequired() {
                    try {
                      if (!labData || !labData.testConfigs) return;
                      Object.keys(labData.testConfigs).forEach(cat => {
                        labData.testConfigs[cat] = (labData.testConfigs[cat] || []).map(cfg => {
                          const clean = { ...cfg };
                          if (Array.isArray(clean.machines)) {
                            clean.machines = clean.machines.filter(m => m !== 'No Machine Required');
                          }
                          return clean;
                        });
                      });
                      console.log('Cleanup: removed "No Machine Required" from saved configs.');
                    } catch (e) { console.warn('Cleanup error:', e); }
                  })();
                // Set initial timeline reset date if not set
                if (!labData.timelineLastReset) {
                    labData.timelineLastReset = new Date();
                }
                
                // Add default machines if none exist
                console.log('Checking machines array. Current labData.machines:', JSON.stringify(labData.machines));
                if (!labData.machines || labData.machines.length === 0) {
                    console.log('Initializing default machines array');
                    labData.machines = [
                        { type: 'high_voltage_tester', name: 'High Voltage Tester', id: 'HVT-001' },
                        { type: 'digital_resistance_meter', name: 'Digital Resistance Meter', id: 'DRM-001' },
                        { type: 'digital_leakage_current_tester', name: 'Digital Leakage Current Tester', id: 'DLC-001' },
                        { type: '4_stations_endurance_test_panel', name: '4 Stations Endurance Test Panel', id: '4SE-001' },
                        { type: 'endurance_test_panel', name: 'Endurance Test Panel', id: 'ETP-001' },
                        { type: 'data_acquisition_system', name: 'Data Acquisition System', id: 'DAS-001' },
                        { type: 'glow_wire_test_apparatus', name: 'Glow Wire Test Apparatus', id: 'GWT-001' },
                        { type: 'sound_level_meter', name: 'Sound Level Meter', id: 'SLM-001' },
                        { type: 'digital_tachometer', name: 'Digital Tachometer', id: 'DT-001' },
                        { type: 'assembly_strength_tester', name: 'Assembly Strength Tester', id: 'AST-001' },
                        { type: 'cord_grip_tester', name: 'Cord Grip Tester', id: 'CGT-001' },
                        { type: 'dimmer', name: 'Dimmer 63A', id: 'DIM-001' },
                        { type: 'dimmer', name: 'Dimmer', id: 'DIM-002' },
                        { type: 'hot_air_oven', name: 'Hot Air Oven', id: 'HAO-001' },
                        { type: 'salt_fog_test_chamber', name: 'Salt Fog Test Chamber', id: 'SFT-001' },
                        { type: 'multimeter', name: 'Multimeter', id: 'MM-001' },
                        { type: 'multimeter', name: 'Multimeter', id: 'MM-002' },
                        { type: 'multimeter', name: 'Multimeter', id: 'MM-003' },
                        { type: 'clamp_meter', name: 'Digital Clamp Meter', id: 'CPM-001' },
                        { type: 'ir_thermometer', name: 'IR Thermometer', id: 'IT-001' },
                        { type: 'micro_controller_based_conductivity_meter', name: 'Micro Controller Based Conductivity Meter', id: 'MCB-001' },
                        { type: 'micro_controller_based_ph_meter', name: 'Micro Controller Based PH Meter', id: 'MCB-002' },
                        { type: '63_a_voltage_synchroniser', name: '63 A Voltage Synchroniser', id: '6AV-001' },
                        { type: '50_a_voltage_synchroniser', name: '50 A Voltage Synchroniser', id: '5AV-001' },
                        { type: 'inverter_testing_jig', name: 'Inverter Testing Jig', id: 'ITJ-001' },
                        { type: 'vernier_caliper', name: 'Vernier Caliper', id: 'VC-001' },
                        { type: 'micrometer', name: 'Micrometer', id: 'M-001' },
                        { type: 'env_chamber', name: 'Environment Chamber', id: 'EVMC-001' },
                        { type: 'anemometer', name: 'Anemometer', id: 'ANE-001' },
                        { type: 'power_supply', name: 'DC Power Supply ( With Solar Array Simulation)', id: 'PS-001' },
                        { type: 'power_meter', name: 'Digital Power Meter', id: 'DPM-001' },
                        { type: '20_channel_multiplexer', name: '20 Channel Multiplexer', id: '2CM-001' },
                        { type: 'pressure_gauge', name: 'Pressure Gauge', id: 'PG-001' },
                        { type: 'stop_watch', name: 'Stop Watch', id: 'SW-001' },
                        { type: 'stop_watch', name: 'Stop Watch', id: 'SW-002' },
                        { type: 'hygrometer_temperature_clock', name: 'Hygrometer/Temperature Clock', id: 'HTC-001' },
                        { type: 'hygrometer_temperature_clock', name: 'Hygrometer/Temperature Clock', id: 'HTC-002' },
                        { type: '3_phase_source_control_panel', name: '3 Phase Source & Control Panel', id: '3PS-001' },
                        { type: 'load_panel', name: 'Load Panel', id: 'LP-001' },
                        { type: 'load_bank', name: 'LED Load Bank', id: 'LB-001' },
                        { type: 'filament_lamp_load', name: 'Filament Lamp Load', id: 'FLL-001' },
                        { type: 'fixture_stand_for_switches', name: 'Fixture Stand For Switches', id: 'FSF-001' },
                        { type: 'fixture_stand_for_socket', name: 'Fixture Stand For Socket', id: 'FSF-002' },
                        { type: 'fixture_stand_for_mcb', name: 'Fixture Stand For MCB', id: 'FSF-003' },
                        { type: '28_days_temperature_rise_test_panel', name: '28 Days & Temperature Rise Test Panel', id: '2DT-001' },
                        { type: 'test_sensitivity_test_bench_for_rccb', name: 'Test Sensitivity Test Bench For RCCB', id: 'TST-001' },
                        { type: '3_station_test_of_tripping_current_characteristic_test', name: '3 Station Test Of Tripping Current Characteristic Test', id: '3ST-001' },
                        { type: 'maximum_minimum_withdrawal_force_apparatus', name: 'Maximum & Minimum Withdrawal Force Apparatus', id: 'MMW-001' },
                        { type: 'test_finger_apparatus', name: 'Test Finger Apparatus', id: 'TFA-001' },
                        { type: 'impact_test_apparatus', name: 'Impact Test Apparatus', id: 'ITA-001' },
                        { type: 'shock_test_apparatus', name: 'Shock Test Apparatus', id: 'STA-001' },
                        { type: 'tumbling_barrel_apparatus_for_plug', name: 'Tumbling Barrel Apparatus For Plug', id: 'TBA-001' },
                        { type: 'No Machine Required', name: 'NILL', id: 'NILL-001' },

                    ];
                }
                
                // Add default technicians if none exist
                loadTechnicians();

                if (labData.technicians.length === 0) {
                    labData.technicians = [
                        { name: 'Sandeep Kumar', id: '5983', shift: 'shiftG', assignedTests: [], currentWorkload: 0, currentUtilization: 0 },
                        { name: 'Manisha', id: '9177', shift: 'shiftG', assignedTests: [], currentWorkload: 0, currentUtilization: 0 },
                        { name: 'Sahil', id: '3110392', shift: 'shiftA', assignedTests: [], currentWorkload: 0, currentUtilization: 0 },
                        { name: 'Jameet', id: '3679297', shift: 'shiftB', assignedTests: [], currentWorkload: 0, currentUtilization: 0 }
                    ];
                }
                
                // Initialize shift schedule with all shifts (24-hour format, end time is exclusive)
                labData.shiftSchedule = {
                    shiftG: { name: 'General Shift', start: 9, end: 17.5 },  // 9:00 AM - 5:30 PM
                    shiftA: { name: 'Shift A', start: 6, end: 14 },         // 6:00 AM - 2:00 PM
                    shiftB: { name: 'Shift B', start: 14, end: 22 },        // 2:00 PM - 10:00 PM
                    shiftC: { name: 'Shift C', start: 22, end: 6 }          // 10:00 PM - 6:00 AM (next day)
                };
                
                // Initialize lifecycle config with default values (excluding UPS)
                labData.lifecycleConfig = {
                    geyser: { cycleTimeMinutes: 60 },
                    ict: { cycleTimeMinutes: 30 },
                    inverter: { cycleTimeMinutes: 45 },
                    stabilizer: { cycleTimeMinutes: 40 },
                    'Air Cooler': { cycleTimeMinutes: 60 },
                    'Water Heater': { cycleTimeMinutes: 60 },
                    'Kitchen Chimney': { cycleTimeMinutes: 45 },
                    'Mixer Grinder': { cycleTimeMinutes: 30 },
                    'Modular Switches': { cycleTimeMinutes: 30 },
                };

                // Clean up lifecycle configs and ensure UPS is removed
                cleanupLifecycleConfigs();
                
                // Final check for any remaining UPS entries
                cleanupUPSFromLifecycle();
                
                updateProductDropdowns();
                updateAllTables();
                updateMetrics();
                updateLifecycleDisplay();
                initializeLifecycleConfig();
                updateShiftIndicator();
                
                // Update shift indicator every minute
                setInterval(updateShiftIndicator, 60000);
                
                // Start shift change monitoring
                setTimeout(checkForShiftChangeReassignment, 10000); // Start after 10 seconds
                
                // Check for timeline reset every hour
                setInterval(checkTimelineReset, 3600000);
                
                // Update man utilization every 5 minutes to reflect time passing
                setInterval(() => {
                    updateMetrics();
                }, 300000); // 5 minutes

                // Add this interval to automatically update active tests display every minute
setInterval(() => {
    if (document.getElementById('progress')?.classList.contains('active')) {
        updateActiveTestsTable();
        updateTimeline();
    }
}, 60000); // Update every minute
                
                // REMOVED verbose initialization alert
                
            } catch (error) {
                console.error('Initialization error:', error);
                showAlert('Initialization failed. Please refresh the page.', 'error');
            }
        }
        
        // Export window functions
        window.generateWordReport = generateWordReport;
        window.generateNCSlide = generateNCSlide;
        window.checkSKUCompletion = checkSKUCompletion;
        window.clearSKUPhotos = clearSKUPhotos;
        window.formatDate = formatDate;
        window.exportToExcel = exportToExcel;
        window.switchTab = switchTab;
        window.updatePreview = updatePreview;
        window.submitProductRequest = submitProductRequest;
        window.confirmSKUNames = confirmSKUNames;
        window.confirmTestConfiguration = confirmTestConfiguration;
        window.updateTestResult = updateTestResult;
        window.addTestConfig = addTestConfig;
        window.removeTestConfig = removeTestConfig;
        window.addMachine = addMachine;
        window.removeMachine = removeMachine;
        window.addTechnician = addTechnician;
        window.removeTechnician = removeTechnician;
        window.showMachineDetails = showMachineDetails;
        window.closeMachineModal = closeMachineModal;
        window.showManDetails = showManDetails;
        window.closeManModal = closeManModal;
        window.showActiveProducts = showActiveProducts;
        window.closeActiveProductsModal = closeActiveProductsModal;
        window.openMachineSelector = openMachineSelector;
        window.closeMachineSelector = closeMachineSelector;
        window.confirmMachineSelection = confirmMachineSelection;
        window.removeMachineFromSelection = removeMachineFromSelection;
        window.showProductStats = showProductStats;
        window.showCompletedStats = showCompletedStats;
        window.showFailedStats = showFailedStats;
        window.closeProductStatsModal = closeProductStatsModal;
        window.addProductCategory = addProductCategory;
        window.removeProductCategory = removeProductCategory;
        window.updateTestSequence = updateTestSequence;
        window.validateSequence = validateSequence;
        window.handleFileSelect = handleFileSelect;
        window.removeFile = removeFile;
        window.addSpecificationSet = addSpecificationSet;
        window.addParameterToSet = addParameterToSet;
        window.removeParameterFromSet = removeParameterFromSet;
        window.removeSpecificationSet = removeSpecificationSet;
        window.selectSpecificationSet = selectSpecificationSet;
        window.removeFromLifecycle = removeFromLifecycle;
        window.toggleLifecycleTimer = toggleLifecycleTimer;
        window.updateLifecycleCycleTime = updateLifecycleCycleTime;
        window.updateTestSpecSelector = updateTestSpecSelector;
        window.handleTestResultChange = handleTestResultChange;
        window.handleNcObservationChange = handleNcObservationChange;
        window.showOnTimeDetails = showOnTimeDetails;
        window.showTestConfigDetails = showTestConfigDetails;
        window.closeTestConfigPopup = closeTestConfigPopup;
        
        // Initialize test config popup
        function initTestConfigPopup() {
            console.log('Initializing test config popup...');
            const popup = document.getElementById('testConfigPopup');
            if (!popup) {
                console.error('testConfigPopup element not found');
                return;
            }
            
            // Set initial state
            popup.style.display = 'none';
            popup.setAttribute('role', 'dialog');
            popup.setAttribute('aria-modal', 'true');
            
            // Close button is now handled by the onclick attribute
            
            // Close when clicking outside content
            popup.onclick = function(event) {
                if (event.target === popup) {
                    closeTestConfigPopup();
                }
            };
            
            // Close on Escape key
            function handleKeyDown(event) {
                if (event.key === 'Escape') {
                    closeTestConfigPopup();
                }
            }
            
            // Handle edit button clicks via event delegation
            function handlePopupClick(event) {
                // Check if the click was on the edit button or a child element
                const editBtn = event.target.closest('.edit-config-btn');
                
                if (editBtn) {
                    console.log('Edit button found, preventing default...');
                    event.preventDefault();
                    event.stopPropagation();
                    
                    const category = editBtn.getAttribute('data-category');
                    const indexStr = editBtn.getAttribute('data-index');
                    const index = parseInt(indexStr, 10);
                    
                    console.log('Edit button clicked:', { 
                        category, 
                        indexStr, 
                        parsedIndex: index,
                        isNaN: isNaN(index),
                        element: editBtn.outerHTML 
                    });
                    
                    if (category && !isNaN(index)) {
                        console.log('Closing popup and preparing to edit...');
                        // Close the popup first
                        closeTestConfigPopup();
                        
                        // Small delay to ensure popup is closed before opening edit
                        setTimeout(() => {
                            try {
                                console.log('Calling editTestConfig with:', { category, index });
                                // Make sure the form is visible and scrolled into view
                                document.getElementById('config').scrollIntoView({ behavior: 'smooth' });
                                editTestConfig(category, index);
                            } catch (error) {
                                console.error('Error in editTestConfig:', error);
                                showAlert('Error loading test configuration for editing: ' + (error.message || 'Unknown error'), 'error');
                            }
                        }, 200);
                    } else {
                        console.error('Invalid edit button data:', { 
                            category, 
                            indexStr, 
                            isCategoryValid: !!category,
                            isIndexValid: !isNaN(index)
                        });
                        showAlert('Error: Invalid configuration data', 'error');
                    }
                }
            }
            
            // Remove any existing click handlers to prevent duplicates
            popup.removeEventListener('click', handlePopupClick);
            
            // Add the new click handler with capture phase to ensure we catch the event
            popup.addEventListener('click', handlePopupClick, true);
            
            // Also add a direct event listener to the document for the edit button
            document.addEventListener('click', function directEditHandler(event) {
                const editBtn = event.target.closest('.edit-config-btn');
                if (editBtn && popup.contains(editBtn)) {
                    console.log('Direct edit button click captured');
                    handlePopupClick(event);
                }
            });
            
            // Add escape key handler
            document.addEventListener('keydown', handleKeyDown);
            
            // Store reference for cleanup
            popup._keydownHandler = handleKeyDown;
        }
        
        // We'll initialize the popup in the main DOMContentLoaded listener below

// ----

// Initialize the dashboard when the page loads
        document.addEventListener('DOMContentLoaded', function() {
            try {
                // Initialize test config popup
                initTestConfigPopup();
                
                // Initialize after ensuring libraries are loaded
                setTimeout(() => {
                    init();
                    
                    // Set up periodic updates
                    setInterval(() => {
                        try {
                            updateMetrics();
                            updateShiftIndicator();
                            
                            if (document.getElementById('progress')?.classList.contains('active')) {
                                updateProgressTab();
                            }
                            
                            if (document.getElementById('resources')?.classList.contains('active')) {
                                updateMachineTable();
                                updateTechnicianTable();
                            }
                            
                            if (document.getElementById('lifecycle')?.classList.contains('active')) {
                                updateLifecycleDisplay();
                            }
                        } catch (error) {
                            console.error('Periodic update error:', error);
                        }
                    }, 30000);
                }, 100);
                
            } catch (error) {
                console.error('Document ready error:', error);
                showAlert('Application failed to initialize', 'error');
            }
        });

// ----

// Show test configuration details
        function showTestConfigDetails(category, index) {
            try {
                console.log('showTestConfigDetails called with:', { category, index });
                console.log('Current labData.testConfigs:', JSON.stringify(labData.testConfigs, null, 2));
                
                // Validate inputs
                if (!category || typeof index === 'undefined') {
                    console.error('Missing required parameters for showTestConfigDetails');
                    return;
                }
                
                // Check if labData and testConfigs exist
                if (!labData || !labData.testConfigs) {
                    console.error('labData or labData.testConfigs is not defined');
                    showAlert('Error: Test configurations not loaded', 'error');
                    return;
                }
                
                // Log all available categories for debugging
                const availableCategories = Object.keys(labData.testConfigs);
                console.log('Available categories:', availableCategories);
                
                // Check if category exists (case-insensitive check)
                const categoryKey = availableCategories.find(cat => 
                    cat.toLowerCase() === category.toLowerCase()
                );
                
                if (!categoryKey) {
                    console.error('Category not found:', category);
                    console.log('Available categories:', availableCategories);
                    return;
                }
                
                console.log(`Found category '${categoryKey}' in testConfigs`);
                const categoryItems = labData.testConfigs[categoryKey];
                console.log(`Items in category '${categoryKey}':`, categoryItems);
                
                // Check if index is valid
                if (index < 0 || index >= categoryItems.length) {
                    console.error('Invalid index for category:', { 
                        category: categoryKey, 
                        index, 
                        length: categoryItems.length,
                        items: categoryItems
                    });
                    return;
                }
                
                const config = labData.testConfigs[category][index];
                if (!config) {
                    console.error('No configuration found at index', index, 'in category', category);
                    return;
                }

                // Helper function to escape HTML
                const escapeHtml = (unsafe) => {
                    if (typeof unsafe !== 'string') return '';
                    return unsafe
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#039;');
                };

                const hours = Math.floor(config.cycleTime);
                const minutes = Math.round((config.cycleTime - hours) * 60);
                const manHours = Math.floor(config.manHours || 0);
                const manMinutes = Math.round(((config.manHours || 0) - manHours) * 60);
                
                // Build specification sets HTML
                let specSetsHTML = '';
                if (config.specificationSets && config.specificationSets.length > 0) {
                    specSetsHTML = config.specificationSets.map(set => {
                        const paramsHTML = (set.parameters || []).map(param => `
                            <div class="spec-param">
                                <span class="spec-param-name">${escapeHtml(param.name)}:</span>
                                <span class="spec-param-value">${escapeHtml(param.value)} ${escapeHtml(param.unit || '')}</span>
                            </div>
                        `).join('');
                        
                        return `
                            <div class="spec-set-preview">
                                <h4>${escapeHtml(set.name || 'Specification Set')}</h4>
                                ${paramsHTML}
                            </div>
                        `;
                    }).join('');
                } else {
                    specSetsHTML = '<p>No specification sets defined.</p>';
                }

                // Create popup content (without the close button)
                const popupContent = `
                    <h3>${escapeHtml(config.name || 'Test Configuration')}</h3>
                    <div class="test-config-details-row">
                        <div class="test-config-details-label">Category:</div>
                        <div class="test-config-details-value">${escapeHtml(category)}</div>
                    </div>
                    <div class="test-config-details-row">
                        <div class="test-config-details-label">Cycle Time:</div>
                        <div class="test-config-details-value">${hours}h ${minutes}m</div>
                    </div>
                    <div class="test-config-details-row">
                        <div class="test-config-details-label">Man Hours:</div>
                        <div class="test-config-details-value">${manHours}h ${manMinutes}m</div>
                    </div>
                    <div class="test-config-details-row">
                        <div class="test-config-details-label">Machines:</div>
                        <div class="test-config-details-value">${escapeHtml(config.machines ? config.machines.join(', ') : 'N/A')}</div>
                    </div>
                    <div class="test-config-details-row">
                        <div class="test-config-details-label">Power (kW):</div>
                        <div class="test-config-details-value">${config.power !== undefined && config.power !== null ? parseFloat(config.power).toFixed(2) : 'N/A'}</div>
                    </div>
                    <div class="test-config-details-row">
                        <div class="test-config-details-label">Number of Technicians:</div>
                        <div class="test-config-details-value">${config.technicians ? (typeof config.technicians === 'number' ? config.technicians : 1) : '1'}</div>
                    </div>
                    <div class="test-config-details-row">
                        <div class="test-config-details-label">Test Procedure:</div>
                        <div class="test-config-details-value">${escapeHtml(config.procedure || 'Not specified')}</div>
                    </div>
                    <div class="test-config-details-row">
                        <div class="test-config-details-label">Specification Sets:</div>
                        <div class="test-config-details-value">${config.specificationSets ? config.specificationSets.length : '0'}</div>
                    </div>
                    ${specSetsHTML}
                    <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
                        <button class="btn-secondary edit-config-btn" 
                                data-category="${escapeHtml(category).replace(/"/g, '&quot;')}" 
                                data-index="${index}" 
                                style="padding: 8px 16px; border-radius: 4px; cursor: pointer;"
                                onclick="event.stopPropagation();">
                            Edit Configuration
                        </button>
                    </div>
                `;

                // Update popup content (only the details, not the close button)
                const detailsElement = document.getElementById('testConfigDetails');
                if (detailsElement) {
                    detailsElement.innerHTML = popupContent;
                }

                const popup = document.getElementById('testConfigPopup');
                if (popup) {
                    popup.style.display = 'flex';
                    // Focus the popup for better accessibility
                    popup.setAttribute('aria-hidden', 'false');
                    popup.focus();
                }
            } catch (error) {
                console.error('Error showing test config details:', error);
                showAlert('Error displaying test configuration details', 'error');
            }
        }

        // Close test configuration popup
        function closeTestConfigPopup(event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            
            const popup = document.getElementById('testConfigPopup');
            if (popup) {
                popup.style.display = 'none';
                popup.setAttribute('aria-hidden', 'true');
                
                // Clean up event listeners
                if (popup._keydownHandler) {
                    document.removeEventListener('keydown', popup._keydownHandler);
                    delete popup._keydownHandler;
                }
            }
        }

// ---- Persistence glue (appended by splitter) ----
(function(){
  try {
    // If a global labData exists, hydrate it from DB and autosave
    if (typeof window !== 'undefined' && 'DB' in window) {
      // Ensure labData exists or wait a tick if it's defined later
      function ensure() {
        try {
          if (typeof window.labData === 'object' && window.labData) {
            const saved = window.DB.load();
            if (saved && typeof saved === 'object') {
              // Merge saved keys into current labData (shallow)
              Object.assign(window.labData, saved);
            }
            // Save periodically
            if (!window.__labDataAutosave) {
              window.__labDataAutosave = setInterval(() => {
                try { window.DB.save(window.labData); } catch(e){}
              }, 3000);
              window.addEventListener('beforeunload', () => {
                try { window.DB.save(window.labData); } catch(e){}
              });
            }
            return true;
          }
        } catch(e){}
        return false;
      }
      if (!ensure()) {
        // Try again shortly if labData is created later in app.js
        const t = setInterval(() => { if (ensure()) clearInterval(t); }, 200);
        // Stop trying after ~10s
        setTimeout(() => clearInterval(t), 10000);
      }
    }
  } catch(e){ console.warn('Persistence glue error', e); }
})();
