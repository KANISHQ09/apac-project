import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { verifyUser } from "../shared/edge/auth/jwt.ts";
import { getCorsAndSecurityHeaders } from "../shared/edge/middleware/cors.ts";

class PDFBuilder {
  doc: any;
  currentPage: any;
  font: any;
  boldFont: any;
  currentY: number;
  pageCount: number;
  
  constructor(doc: any, font: any, boldFont: any) {
    this.doc = doc;
    this.font = font;
    this.boldFont = boldFont;
    this.pageCount = 0;
    this.addNewPage();
  }
  
  addNewPage() {
    this.currentPage = this.doc.addPage([595, 842]);
    this.pageCount++;
    this.currentY = 780;
    
    // Draw Top Header Banner
    this.currentPage.drawRectangle({
      x: 30,
      y: 795,
      width: 535,
      height: 30,
      color: rgb(0.12, 0.45, 0.74), // Deep blue
    });
    this.currentPage.drawText("SAMADHAN MUNICIPAL COORDINATION PLATFORM", {
      x: 40,
      y: 806,
      size: 10,
      font: this.boldFont,
      color: rgb(1, 1, 1),
    });
    
    // Draw Page Number
    this.currentPage.drawText(`Page ${this.pageCount}`, {
      x: 520,
      y: 806,
      size: 8,
      font: this.font,
      color: rgb(1, 1, 1),
    });
  }
  
  checkY(requiredHeight: number) {
    if (this.currentY - requiredHeight < 50) {
      this.addNewPage();
    }
  }
  
  writeText(text: string, size = 9, isBold = false, color = rgb(0.1, 0.1, 0.1), maxWidth = 535, indent = 0) {
    const activeFont = isBold ? this.boldFont : this.font;
    const words = text.split(" ");
    let line = "";
    
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const testWidth = activeFont.widthOfTextAtSize(testLine, size);
      if (testWidth > maxWidth && n > 0) {
        this.checkY(size + 4);
        this.currentPage.drawText(line, {
          x: 30 + indent,
          y: this.currentY,
          size,
          font: activeFont,
          color,
        });
        line = words[n] + " ";
        this.currentY -= (size + 4);
      } else {
        line = testLine;
      }
    }
    this.checkY(size + 4);
    this.currentPage.drawText(line, {
      x: 30 + indent,
      y: this.currentY,
      size,
      font: activeFont,
      color,
    });
    this.currentY -= (size + 8);
  }
  
  drawHeading(text: string) {
    this.checkY(35);
    this.currentY -= 12;
    this.currentPage.drawRectangle({
      x: 30,
      y: this.currentY - 2,
      width: 535,
      height: 18,
      color: rgb(0.92, 0.95, 0.98), // Soft blue tint
    });
    this.currentPage.drawText(text.toUpperCase(), {
      x: 35,
      y: this.currentY + 2,
      size: 9,
      font: this.boldFont,
      color: rgb(0.12, 0.45, 0.74),
    });
    this.currentY -= 20;
  }

  drawRow(label: string, value: string) {
    this.checkY(15);
    this.currentPage.drawText(label + ":", {
      x: 30,
      y: this.currentY,
      size: 9,
      font: this.boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    this.currentPage.drawText(value, {
      x: 180,
      y: this.currentY,
      size: 9,
      font: this.font,
      color: rgb(0.1, 0.1, 0.1),
    });
    this.currentY -= 14;
  }
}

Deno.serve(async (req) => {
  const headers = getCorsAndSecurityHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Verify user JWT
    const authResult = await verifyUser(req);
    if (authResult.error) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: authResult.status || 401,
        headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { planId, departmentKey } = body;

    if (!planId || !departmentKey) {
      return new Response(JSON.stringify({ error: "planId and departmentKey are required" }), {
        status: 400,
        headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
      });
    }

    // Fetch Plan details
    const { data: plan, error: planErr } = await supabase
      .from("ai_coordination_plans")
      .select("*")
      .eq("id", planId)
      .single();

    if (planErr || !plan) {
      throw new Error(`Plan not found: ${planErr?.message || "Not found"}`);
    }

    const caseId = plan.case_id;

    // Fetch Case details
    const { data: issue, error: issueErr } = await supabase
      .from("reported_issues")
      .select("*")
      .eq("id", caseId)
      .single();

    if (issueErr || !issue) {
      throw new Error(`Case not found: ${issueErr?.message}`);
    }

    // Fetch Participant details
    const { data: participant, error: partErr } = await supabase
      .from("ai_plan_participants")
      .select("*")
      .eq("plan_id", planId)
      .eq("department", departmentKey)
      .maybeSingle();

    if (partErr) {
      throw partErr;
    }

    // Fetch Plan Tasks of this department
    const { data: tasks, error: tasksErr } = await supabase
      .from("ai_plan_tasks")
      .select("*")
      .eq("plan_id", planId)
      .eq("department", departmentKey)
      .order("temp_id");

    if (tasksErr) throw tasksErr;

    // Fetch All Plan Tasks to resolve dependencies
    const { data: allTasks, error: allTasksErr } = await supabase
      .from("ai_plan_tasks")
      .select("*")
      .eq("plan_id", planId);
    
    if (allTasksErr) throw allTasksErr;

    // Fetch Plan Dependencies
    const { data: dependencies, error: depErr } = await supabase
      .from("ai_plan_dependencies")
      .select("*")
      .eq("plan_id", planId);

    if (depErr) throw depErr;

    const planVersion = plan.version || 1;

    // 1. Initialize case_work_orders row as GENERATING
    const { data: workOrder, error: woErr } = await supabase
      .from("case_work_orders")
      .upsert({
        case_id: caseId,
        plan_id: planId,
        department_key: departmentKey,
        storage_path: `case/${caseId}/plan/v${planVersion}/department/${departmentKey}/work-order.pdf`,
        status: "GENERATING",
        version: planVersion,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "plan_id,department_key"
      })
      .select()
      .single();

    if (woErr || !workOrder) {
      throw new Error(`Failed to upsert case_work_orders: ${woErr?.message}`);
    }

    // 2. Generate PDF using pdf-lib
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const builder = new PDFBuilder(pdfDoc, font, boldFont);
    
    // Page Title & Stylized Header
    builder.writeText("GOVERNMENT OF URBAN DISTRICT & CIVIC AFFAIRS", 8, true, rgb(0.4, 0.4, 0.4));
    builder.writeText("SAMADHAN MUNICIPAL COORDINATION AUTHORITY", 12, true, rgb(0.12, 0.45, 0.74));
    builder.writeText(`DEPARTMENT WORK ORDER: ${departmentKey.replace("_", " ").toUpperCase()}`, 11, true, rgb(0.2, 0.2, 0.2));
    builder.writeText(`Security Status: RESTRICTED  |  Generated on: ${new Date().toLocaleString()}`, 8, false, rgb(0.5, 0.5, 0.5));
    
    // Draw QR Code block representation
    builder.currentPage.drawRectangle({
      x: 480,
      y: 720,
      width: 60,
      height: 60,
      borderColor: rgb(0.12, 0.45, 0.74),
      borderWidth: 1.5,
    });
    builder.currentPage.drawRectangle({ x: 485, y: 755, width: 10, height: 10, color: rgb(0.12, 0.45, 0.74) });
    builder.currentPage.drawRectangle({ x: 525, y: 755, width: 10, height: 10, color: rgb(0.12, 0.45, 0.74) });
    builder.currentPage.drawRectangle({ x: 485, y: 725, width: 10, height: 10, color: rgb(0.12, 0.45, 0.74) });
    builder.currentPage.drawRectangle({ x: 505, y: 740, width: 10, height: 10, color: rgb(0.12, 0.45, 0.74) });
    
    builder.currentPage.drawText("SECURE VERIFICATION", {
      x: 475,
      y: 710,
      size: 6,
      font: boldFont,
      color: rgb(0.12, 0.45, 0.74),
    });

    builder.currentY -= 20;

    // General Meta
    builder.drawHeading("Case Metadata");
    builder.drawRow("Case Number", issue.case_number || "N/A");
    builder.drawRow("Grievance Category", issue.category);
    builder.drawRow("Incident Location", issue.location || "N/A");
    builder.drawRow("Severity Level", issue.severity || "MEDIUM");
    builder.drawRow("Lead Department", (issue.lead_department || "water_supply").replace("_", " ").toUpperCase());
    builder.currentY -= 10;

    // Role Description
    builder.drawHeading("Your Operational Role");
    const role = participant?.participation_role || "SUPPORTING";
    builder.drawRow("Assigned Role", role);
    builder.drawRow("Role Description", participant?.responsibility_reason || "Assigned supporting duties.");
    builder.currentY -= 10;

    // Action Plan / Tasks
    builder.drawHeading("Your Action Steps");
    if (!tasks || tasks.length === 0) {
      builder.writeText("No specific action steps assigned to your department in this plan version.", 9, false, rgb(0.4, 0.4, 0.4));
    } else {
      for (const t of tasks) {
        builder.writeText(`[${t.temp_id}] ${t.title}`, 10, true, rgb(0.1, 0.1, 0.1));
        if (t.description) {
          builder.writeText(t.description, 9, false, rgb(0.3, 0.3, 0.3), 500, 15);
        }
        builder.writeText(`Priority: ${t.priority}  |  SLA Duration: ${t.sla_duration_minutes} minutes`, 8, false, rgb(0.4, 0.4, 0.4), 500, 15);
        
        // Find if this task has dependencies
        const preds = dependencies
          .filter((d: any) => d.successor_temp_id === t.temp_id)
          .map((d: any) => {
            const pt = allTasks.find((task: any) => task.temp_id === d.predecessor_temp_id);
            return pt ? `[${pt.temp_id}] (${pt.department.replace("_", " ")})` : d.predecessor_temp_id;
          });
        
        if (preds.length > 0) {
          builder.writeText(`Must Finish First: ${preds.join(", ")}`, 8, true, rgb(0.7, 0.4, 0.1), 500, 15);
        }
        
        const evidenceRules = t.completion_evidence_rules;
        if (evidenceRules?.fieldInstructions) {
          builder.writeText(`Field Instructions: ${evidenceRules.fieldInstructions}`, 8, false, rgb(0.2, 0.2, 0.2), 500, 15);
        }
        if (evidenceRules?.safetyNotes) {
          builder.writeText(`Safety Notes: ${evidenceRules.safetyNotes}`, 8, true, rgb(0.7, 0.2, 0.2), 500, 15);
        }
        if (Array.isArray(evidenceRules?.evidenceChecklist) && evidenceRules.evidenceChecklist.length > 0) {
          builder.writeText("Quality Checklist:", 8, true, rgb(0.2, 0.2, 0.2), 500, 15);
          for (const item of evidenceRules.evidenceChecklist) {
            builder.writeText(`- ${item}`, 8, false, rgb(0.3, 0.3, 0.3), 480, 25);
          }
        }
        if (evidenceRules?.evidenceRequired) {
          builder.writeText(`Required Evidence: ${Array.isArray(evidenceRules.evidenceTypes) ? evidenceRules.evidenceTypes.join(", ") : "Evidence Required"}`, 8, true, rgb(0.12, 0.45, 0.74), 500, 15);
        }
        
        builder.currentY -= 6;
      }
    }
    builder.currentY -= 10;

    // Sign-off section
    builder.drawHeading("Completion Sign-off");
    builder.writeText("By executing this work order, the department verifies that all action steps have been carried out in compliance with municipal standard operating procedures and evidence criteria.", 8, false, rgb(0.4, 0.4, 0.4));
    builder.currentY -= 30;
    
    builder.checkY(50);
    // Draw sign lines
    builder.currentPage.drawLine({
      start: { x: 30, y: builder.currentY },
      end: { x: 200, y: builder.currentY },
      thickness: 1,
      color: rgb(0.5, 0.5, 0.5),
    });
    builder.currentPage.drawLine({
      start: { x: 360, y: builder.currentY },
      end: { x: 530, y: builder.currentY },
      thickness: 1,
      color: rgb(0.5, 0.5, 0.5),
    });
    builder.currentY -= 12;
    builder.currentPage.drawText("Department Field Officer", {
      x: 30,
      y: builder.currentY,
      size: 8,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    });
    builder.currentPage.drawText("Municipal Commissioner Approval", {
      x: 360,
      y: builder.currentY,
      size: 8,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    });

    const pdfBytes = await pdfDoc.save();

    // 3. Upload to Supabase Storage
    const storagePath = `case/${caseId}/plan/v${planVersion}/department/${departmentKey}/work-order.pdf`;
    
    const { error: uploadErr } = await supabase.storage
      .from("case-work-orders")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true
      });

    if (uploadErr) {
      throw new Error(`Failed to upload PDF to storage: ${uploadErr.message}`);
    }

    // 4. Update status to READY
    await supabase
      .from("case_work_orders")
      .update({
        status: "READY",
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", workOrder.id);

    return new Response(JSON.stringify({ status: "success", storagePath }), {
      headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("PDF generation failed:", err);
    
    // Attempt to set status to FAILED if we have body values
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body.planId && body.departmentKey) {
        await supabase
          .from("case_work_orders")
          .update({
            status: "FAILED",
            updated_at: new Date().toISOString()
          })
          .eq("plan_id", body.planId)
          .eq("department_key", body.departmentKey);
      }
    } catch (dbErr) {
      console.error("Failed to mark work order as FAILED:", dbErr);
    }

    return new Response(JSON.stringify({ error: err.message || "PDF generation failed" }), {
      status: 500,
      headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
    });
  }
});
