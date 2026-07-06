import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Load environment variables from .env file manually to keep it zero-dependency
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.substring(0, index).trim();
      let val = trimmed.substring(index + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
      } else if (val.startsWith("'") && val.endsWith("'")) {
        val = val.substring(1, val.length - 1);
      }
      process.env[key] = val;
    }
  }
}

loadEnv();

const supabaseUrl = process.env.VITE_FORM_KB_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const nvidiaApiKey = process.env.NVIDIA_NIM_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Error: VITE_FORM_KB_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}

if (!nvidiaApiKey) {
  console.warn("Warning: NVIDIA_NIM_API_KEY is not set. Embedding generation will fail if it makes live requests.");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface SeedForm {
  form_code: string;
  form_name: string;
  description: string;
  source_url: string;
  version: string;
  effective_date: string;
  chunks: Array<{
    chunk_title: string;
    chunk_type: "eligibility" | "documents" | "steps" | "submission" | "general";
    chunk_content: string;
  }>;
}

const formsToSeed: SeedForm[] = [
  {
    form_code: "PMAY-U",
    form_name: "Pradhan Mantri Awas Yojana — Urban",
    description: "Affordable housing scheme for urban poor, Economically Weaker Sections (EWS), and Low Income Groups (LIG).",
    source_url: "https://pmaymis.gov.in",
    version: "v2.0",
    effective_date: "2026-01-01",
    chunks: [
      {
        chunk_title: "PMAY Urban Eligibility Criteria",
        chunk_type: "eligibility",
        chunk_content: `## Who Can Apply for PMAY Urban?
- The applicant or any family member must NOT own a pucca (permanent) house anywhere in India.
- Annual household income must fall in one of these categories:
  - EWS (Economically Weaker Section): Up to ₹3 lakh per year.
  - LIG (Low Income Group): ₹3 lakh to ₹6 lakh per year.
  - MIG-I (Middle Income Group I): ₹6 lakh to ₹12 lakh per year.
  - MIG-II (Middle Income Group II): ₹12 lakh to ₹18 lakh per year.
- Beneficiary must be an Indian citizen.
- Preference is given to female heads of household, SC/ST, minorities, and differently-abled individuals.`
      },
      {
        chunk_title: "PMAY Urban Required Documents",
        chunk_type: "documents",
        chunk_content: `## Required Documents for PMAY-U:
1. **Aadhaar Card** (Mandatory for all family members).
2. **Identity Proof** (Voter ID, PAN Card, or Passport).
3. **Address Proof** (Ration Card, Electricity Bill, or Water Bill).
4. **Income Certificate** issued by a competent state authority or Salary Slips (last 3 months).
5. **Self-Declaration Affidavit** stating that no family member owns a permanent house in India.
6. **Bank Account Details** (Passbook copy showing Account Number and IFSC Code for direct benefit transfer).
7. **Caste Certificate** (for SC/ST/OBC categories).`
      },
      {
        chunk_title: "PMAY Urban Step-by-Step Filling Guide",
        chunk_type: "steps",
        chunk_content: `## How to Fill the PMAY-U Form:
- **Section 1: Aadhaar Details**: Enter your 12-digit Aadhaar number and full name exactly as written on the Aadhaar card.
- **Section 2: Personal Information**: Enter State, District, City, Father's Name, Gender, and Marital Status.
- **Section 3: Family Details**: List all family members, their relationship, age, and Aadhaar numbers.
- **Section 4: Income Details**: Declare your family's annual income. Be accurate as this is verified against your Income Certificate.
- **Section 5: Bank Details**: Fill in bank name, branch name, account number, and IFSC code. Re-check for typos.
- **Section 6: Consent**: Check the declaration box and sign/thumb-print the form.`
      },
      {
        chunk_title: "PMAY Urban Submission and Deadlines",
        chunk_type: "submission",
        chunk_content: `## Where to Submit PMAY-U Form:
- **In Person**: Submit the physical application form at your local Municipal Corporation office or designated Common Service Centre (CSC).
- **Online**: Apply through the official online portal at https://pmaymis.gov.in.
- **Fees**: Free of charge if applying through government offices. CSCs may charge a nominal fee of ₹25.
- **Deadlines**: Check with local municipal bodies as submission windows vary by city and state announcement.`
      }
    ]
  },
  {
    form_code: "PMAY-G",
    form_name: "Pradhan Mantri Awas Yojana — Gramin",
    description: "Rural housing scheme aiming to provide a pucca house with basic amenities to all homeless households and houses with kutcha walls in rural areas.",
    source_url: "https://pmayg.nic.in",
    version: "v2.0",
    effective_date: "2026-01-01",
    chunks: [
      {
        chunk_title: "PMAY Gramin Eligibility Criteria",
        chunk_type: "eligibility",
        chunk_content: `## Who Can Apply for PMAY Gramin?
- Households living in houses with zero, one, or two rooms with kutcha walls and roof.
- Families with no literate adult above 25 years.
- Households with no male adult member between 16 and 59 years.
- Landless households deriving major part of income from manual casual labour.
- Auto-inclusion for primitive tribal groups, bonded labourers, and homeless families.`
      },
      {
        chunk_title: "PMAY Gramin Required Documents",
        chunk_type: "documents",
        chunk_content: `## Required Documents for PMAY-G:
1. **Aadhaar Number** and consent document.
2. **Bank Account Details** (Passbook copy) for receiving funds.
3. **MGNREGA Job Card Number** (registered job card).
4. **Swachh Bharat Mission (SBM) Number**.
5. **Mobile Number**.
6. **Certificate of land ownership/lease** where the house is to be built.`
      },
      {
        chunk_title: "PMAY Gramin Application Steps",
        chunk_type: "steps",
        chunk_content: `## Application Steps for PMAY-G:
- Selection is based on SECC 2011 data and Gram Sabha verification.
- **Step 1**: Registrations are done on the AwaasSoft portal by local Gram Panchayat officials.
- **Step 2**: Provide personal details, bank account, and MGNREGA job card number.
- **Step 3**: Geo-tagging of the existing kutcha house site is completed by block inspectors.`
      },
      {
        chunk_title: "PMAY Gramin Funds and Submission",
        chunk_type: "submission",
        chunk_content: `## Submission and Financial Assistance:
- Direct physical application is coordinated through the Gram Panchayat or block development office.
- Financial assistance (subsidy) of ₹1.2 Lakh (plains) or ₹1.3 Lakh (hilly areas) is transferred in installments directly to the verified bank account.
- **Fees**: Completely free of charge.`
      }
    ]
  },
  {
    form_code: "PM-KISAN",
    form_name: "PM Kisan Samman Nidhi",
    description: "Income support scheme providing ₹6,000 per year in three equal installments to all landholding farmer families.",
    source_url: "https://pmkisan.gov.in",
    version: "v1.5",
    effective_date: "2025-06-01",
    chunks: [
      {
        chunk_title: "PM-Kisan Eligibility and Exclusions",
        chunk_type: "eligibility",
        chunk_content: `## Eligibility for PM-Kisan:
- All small and marginal landholder farmer families who own cultivable land in their names.
- **Exclusions**:
  - Institutional landholders.
  - Families where any member is a serving or retired government officer.
  - Income tax payers in the last assessment year.
  - Professionals like Doctors, Engineers, Lawyers, and CAs.`
      },
      {
        chunk_title: "PM-Kisan Required Documents",
        chunk_type: "documents",
        chunk_content: `## Documents Required for PM-Kisan registration:
1. **Aadhaar Card** (Mandatory, must be linked to mobile number for e-KYC).
2. **Landholding Documents** (Khatauni/Patta copy showing land ownership).
3. **Bank Passbook** (Linked with Aadhaar for DBT).
4. **Mobile Number** (for receiving OTPs and updates).`
      },
      {
        chunk_title: "PM-Kisan Registration Process",
        chunk_type: "steps",
        chunk_content: `## How to Fill the PM-Kisan Registration Form:
- **Step 1**: Go to Farmers Corner on the PM-Kisan portal or use the physical form.
- **Step 2**: Select Rural/Urban Farmer Registration, enter your Aadhaar and mobile number, and select your State.
- **Step 3**: Fill in District, Sub-District, Block, and Village.
- **Step 4**: Enter Farmer Details (Name, Category, Land details like Survey/Khasna number, Area in hectares).
- **Step 5**: Upload scanned land copy and Aadhaar copy.`
      },
      {
        chunk_title: "PM-Kisan Submission and Status",
        chunk_type: "submission",
        chunk_content: `## Submission Channels for PM-Kisan:
- **Physical**: Local Patwari, Revenue Officer, or Nodal Officer designated by State Government.
- **Online**: Register directly at https://pmkisan.gov.in under 'New Farmer Registration'.
- **Verification**: State government verifies the land records before transferring funds.`
      }
    ]
  },
  {
    form_code: "AADHAAR-UPDATE",
    form_name: "Aadhaar Address/Name Update Form",
    description: "Form to update or correct demographic details (Name, Address, Date of Birth, Gender, Mobile, Email) in the Aadhaar database.",
    source_url: "https://uidai.gov.in",
    version: "v4.0",
    effective_date: "2025-01-01",
    chunks: [
      {
        chunk_title: "Aadhaar Update Limits and Eligibility",
        chunk_type: "eligibility",
        chunk_content: `## Aadhaar Update Rules:
- Any resident Indian citizen holding an Aadhaar card can request updates.
- **Limits**:
  - Name Update: Allowed twice (2 times) in a lifetime.
  - Date of Birth (DoB): Allowed once (1 time) in a lifetime.
  - Gender: Allowed once (1 time) in a lifetime.
  - Address & Mobile/Email: No lifetime limit, can be updated whenever necessary.`
      },
      {
        chunk_title: "Aadhaar Update Supporting Documents",
        chunk_type: "documents",
        chunk_content: `## Supporting Documents for Aadhaar Updates:
- **Name Correction**: Proof of Identity (POI) like Passport, PAN Card, Voter ID, or Driving License.
- **Address Correction**: Proof of Address (POA) like Electricity Bill, Water Bill, Bank Statement (last 3 months), Rent Agreement, or Voter ID.
- **Date of Birth Correction**: Birth Certificate, SSLC Book/Certificate, or Passport.
- **Mobile/Email/Biometrics**: No document required (requires physical visit to center).`
      },
      {
        chunk_title: "Filling the Aadhaar Update Form",
        chunk_type: "steps",
        chunk_content: `## How to Fill Aadhaar Update/Correction Form:
- Use capital letters only.
- **Field 1: Aadhaar Number**: Enter your 12-digit Aadhaar number carefully.
- **Field 2: Details to Update**: Select check-boxes for fields you want to update (e.g., Address, Name).
- **Field 3: Correct Details**: Write the *new/correct* information clearly. Leave unchanged fields blank.
- **Field 4: Signature/Thumbprint**: Sign or place thumb impression at the bottom.`
      },
      {
        chunk_title: "Aadhaar Update Submission and Charges",
        chunk_type: "submission",
        chunk_content: `## Submission and Fees for Aadhaar Updates:
- **Online**: Address update can be done on the myAadhaar portal (https://myaadhaar.uidai.gov.in). Fee is ₹50.
- **Offline (Aadhaar Center)**: Visit any Aadhaar Seva Kendra for demographic (₹50) or biometric (₹100) updates.
- **Timeline**: Updates usually take 5 to 30 days to reflect.`
      }
    ]
  },
  {
    form_code: "AADHAAR-ENROLLMENT",
    form_name: "Aadhaar New Enrollment Form",
    description: "Form for new enrollment of resident Indian citizens, NRIs, and foreign nationals residing in India.",
    source_url: "https://uidai.gov.in",
    version: "v4.0",
    effective_date: "2025-01-01",
    chunks: [
      {
        chunk_title: "Aadhaar New Enrollment Eligibility",
        chunk_type: "eligibility",
        chunk_content: `## Eligibility for New Aadhaar Enrollment:
- Any resident individual who has resided in India for a period or periods amounting in all to 182 days or more in the 12 months immediately preceding the date of application.
- Open to all age groups, including infants (Bal Aadhaar, blue card, under 5 years).`
      },
      {
        chunk_title: "Aadhaar New Enrollment Documents",
        chunk_type: "documents",
        chunk_content: `## Documents for New Aadhaar Enrollment:
- **Proof of Identity (POI)**: Passport, PAN Card, Voter ID.
- **Proof of Address (POA)**: Ration Card, Electricity/Water bill, Bank Passbook.
- **Proof of Relationship (POR)** (for kids): Birth Certificate showing parents' names.
- **Date of Birth (DoB)** proof: Birth Certificate.`
      },
      {
        chunk_title: "Filling the Enrollment Form",
        chunk_type: "steps",
        chunk_content: `## How to Fill the Aadhaar Enrollment Form:
- Fill using black/blue ballpoint pen in capital letters.
- **Step 1**: Select 'Resident' or 'Non-Resident Indian (NRI)'.
- **Step 2**: Enter Full Name, Gender, Age/Date of Birth.
- **Step 3**: Provide complete Address with Landmark and PIN code.
- **Step 4**: Enter Details of Father/Mother/Guardian (mandatory for children under 5 years).`
      },
      {
        chunk_title: "New Aadhaar Enrollment Submission",
        chunk_type: "submission",
        chunk_content: `## Submission for New Aadhaar Enrollment:
- **Where**: Requires a physical visit to an authorized Aadhaar Seva Kendra (Aadhaar Center) for biometric capture (fingerprints, iris scan, and photo).
- **Fees**: Completely free of charge for new enrollment.`
      }
    ]
  },
  {
    form_code: "AYUSHMAN-BHARAT",
    form_name: "Ayushman Bharat PM-JAY Application",
    description: "National health protection scheme providing health cover up to ₹5 lakh per family per year for secondary and tertiary care hospitalization.",
    source_url: "https://pmjay.gov.in",
    version: "v1.2",
    effective_date: "2025-01-01",
    chunks: [
      {
        chunk_title: "Ayushman Bharat Eligibility criteria",
        chunk_type: "eligibility",
        chunk_content: `## Who is eligible for PM-JAY?
- Households identified based on SECC 2011 deprivation criteria in rural and urban areas:
  - Rural: Households with no room/kutcha walls, landless, manual scavengers, destitute/living on alms.
  - Urban: Under 11 occupational categories (ragpickers, beggars, domestic workers, street vendors, construction workers, etc.).
  - Families with no cap on family size or age limit.`
      },
      {
        chunk_title: "Ayushman Bharat Required Documents",
        chunk_type: "documents",
        chunk_content: `## Required Documents for Ayushman Card:
1. **Aadhaar Card** or Voter ID.
2. **Ration Card** or Family Identification document proving name in SECC list.
3. Active Mobile Number.
4. **PM-JAY Letter** / HHID number (if received by mail).`
      },
      {
        chunk_title: "How to apply for Ayushman Card",
        chunk_type: "steps",
        chunk_content: `## How to Get Your Ayushman Card:
- **Step 1**: Verify your eligibility on 'Am I Eligible' portal using mobile/ration card.
- **Step 2**: Visit a nearby empanelled hospital or Common Service Centre (CSC).
- **Step 3**: Show Aadhaar Card and Ration Card to the Ayushman Mitra/operator.
- **Step 4**: Complete biometric verification.
- **Step 5**: Once approved, print the golden Ayushman Card.`
      },
      {
        chunk_title: "Ayushman Bharat Submission and Treatment",
        chunk_type: "submission",
        chunk_content: `## Submitting Ayushman Bharat Application:
- Application is handled online by CSC operators or Ayushman Mitras at empanelled government/private hospitals.
- **Fees**: Ayushman Card print at hospital is Free. CSC may charge ₹30 for plastic card printing.
- **Benefits**: Cashless treatment at all empanelled hospitals.`
      }
    ]
  },
  {
    form_code: "PM-SVANidhi",
    form_name: "PM Street Vendor's AtmaNirbhar Nidhi",
    description: "Special micro-credit scheme for street vendors to access collateral-free working capital loan up to ₹50,000.",
    source_url: "https://pmsvanidhi.mohua.gov.in",
    version: "v2.1",
    effective_date: "2025-08-01",
    chunks: [
      {
        chunk_title: "PM-SVANidhi Eligibility Criteria",
        chunk_type: "eligibility",
        chunk_content: `## Who Can Apply for PM-SVANidhi Loan?
- Street vendors vending in urban areas on or before March 24, 2020.
- Vendors holding Certificate of Vending (CoV) or Identity Card issued by Urban Local Bodies (ULBs).
- Vendors in surrounding rural/semi-urban areas vending in ULB areas.`
      },
      {
        chunk_title: "PM-SVANidhi Documents Required",
        chunk_type: "documents",
        chunk_content: `## Required Documents for PM-SVANidhi loan:
1. **Aadhaar Card** (must be linked to active mobile number).
2. **Voter ID Card** (optional but recommended).
3. **Certificate of Vending (CoV)** or Letter of Recommendation (LoR) from local municipality/town vending committee.
4. **Bank Account Details** (Passbook copy).`
      },
      {
        chunk_title: "PM-SVANidhi Application Steps",
        chunk_type: "steps",
        chunk_content: `## How to Apply for PM-SVANidhi Loan:
- **Step 1**: Visit the PM SVANidhi portal or download the PM SVANidhi mobile app.
- **Step 2**: Enter mobile number linked to Aadhaar to receive OTP.
- **Step 3**: Input Certificate of Vending (CoV) number or Request Letter of Recommendation (LoR).
- **Step 4**: Enter your bank account and select preferred lending institution (Bank/NBFC).
- **Step 5**: Choose loan amount (1st tranche: ₹10,000, 2nd tranche: ₹20,000, 3rd tranche: ₹50,000).`
      },
      {
        chunk_title: "PM-SVANidhi Submission and Interest Subsidy",
        chunk_type: "submission",
        chunk_content: `## Submission and Loan Details:
- **Where**: Apply online at https://pmsvanidhi.mohua.gov.in or through a local bank branch or CSC.
- **Interest Subsidy**: 7% interest subsidy is credited directly to the vendor's bank account on timely repayment.
- **Fees**: No processing fee or collateral required.`
      }
    ]
  },
  {
    form_code: "NREGA-JOB-CARD",
    form_name: "MGNREGS Job Card Application",
    description: "Application for registration under Mahatma Gandhi National Rural Employment Guarantee Scheme, guaranteeing 100 days of manual wage employment in a financial year.",
    source_url: "https://nrega.nic.in",
    version: "v1.0",
    effective_date: "2024-01-01",
    chunks: [
      {
        chunk_title: "NREGA Job Card Eligibility",
        chunk_type: "eligibility",
        chunk_content: `## Eligibility for MGNREGS Job Card:
- All adult members of a rural household who are willing to do unskilled manual work.
- Must be local residents of the Gram Panchayat where application is submitted.`
      },
      {
        chunk_title: "NREGA Required Documents",
        chunk_type: "documents",
        chunk_content: `## Documents Required for Job Card registration:
1. **Aadhaar Card** of all adult family members.
2. **Ration Card** or Voter ID.
3. Passport size photographs of all applicants.
4. **Bank Account Details** (Passbook copy for receiving wages directly).`
      },
      {
        chunk_title: "Filling the NREGA Job Card Form",
        chunk_type: "steps",
        chunk_content: `## How to Fill the MGNREGA Job Card Application Form:
- Fill personal details in capital letters:
  - Name of Gram Panchayat, Block, and Village.
  - Name of Head of Household.
  - Name, Gender, Age, and Aadhaar Card number of all adult members willing to work.
  - Details of land ownership (if applicable, SC/ST status).
  - Joint bank account details.`
      },
      {
        chunk_title: "NREGA Job Card Submission and Issuance",
        chunk_type: "submission",
        chunk_content: `## Submission and Job Card Issuance:
- **Where**: Submit the form to the Gram Panchayat office (Gram Rozgar Sahayak or Panchayat Secretary).
- **Time**: Job Card must be issued within 15 days of application.
- **Fees**: Completely free of cost.`
      }
    ]
  },
  {
    form_code: "SCHOLARSHIP-NSP",
    form_name: "National Scholarship Portal Application",
    description: "Single window portal for applying to various scholarships offered by Central Ministries, State Governments, and UGC/AICTE.",
    source_url: "https://scholarships.gov.in",
    version: "v5.0",
    effective_date: "2025-06-01",
    chunks: [
      {
        chunk_title: "NSP Scholarship Eligibility Slabs",
        chunk_type: "eligibility",
        chunk_content: `## Eligibility for NSP Scholarships:
- Varies by specific scheme (Pre-Matric, Post-Matric, Merit-cum-Means).
- Generally requires student to be enrolled in a recognized school/college.
- Minimum marks in previous qualifying exam (usually 50% or above).
- Annual household income must be below specified limit (typically ₹1 lakh to ₹2.5 lakh depending on category).`
      },
      {
        chunk_title: "NSP Required Documents",
        chunk_type: "documents",
        chunk_content: `## Supporting Documents for NSP:
1. **Student Photograph**.
2. **Domicile Certificate** (Proof of state residency).
3. **Caste Certificate** (SC/ST/OBC where applicable).
4. **Income Certificate** of parent/guardian.
5. **Self-Declaration/Fee Receipt** from the current institution.
6. **Mark sheet** of last qualifying exam.
7. **Bank Passbook** showing account holder's name and IFSC code.`
      },
      {
        chunk_title: "Filling the NSP Application Form",
        chunk_type: "steps",
        chunk_content: `## How to Register and Fill NSP Form:
- **Step 1 (Fresh Registration)**: Provide Domicile State, Scholarship Category (Pre/Post matric), Student Name, Scheme Type, DOB, Mobile, and Email.
- **Step 2**: Get Login ID and Password on mobile, log in and change password.
- **Step 3**: Fill 'Application Form' with academic details, school/college roll number, fees paid.
- **Step 4**: Enter bank account details very carefully.
- **Step 5**: Upload scanned documents (only required for scholarships > ₹50,000).`
      },
      {
        chunk_title: "NSP Submission and Deadlines",
        chunk_type: "submission",
        chunk_content: `## NSP Submission and Deadlines:
- **Where**: Completely online through https://scholarships.gov.in.
- **Deadlines**: Usually opens in July/August and closes around October/November each academic year.
- **Fees**: No registration or processing fee.`
      }
    ]
  },
  {
    form_code: "INCOME-CERT",
    form_name: "Income Certificate Application (State)",
    description: "State-issued certificate verifying an individual or family's annual income from all sources (agriculture, salary, business, etc.).",
    source_url: "Varies by State Portal (e.g., e-District)",
    version: "v1.0",
    effective_date: "2024-01-01",
    chunks: [
      {
        chunk_title: "Income Certificate Eligibility",
        chunk_type: "eligibility",
        chunk_content: `## Eligibility for Income Certificate:
- Any resident individual whose annual income needs to be certified for scholarship, subsidy, or scheme eligibility.
- Can be applied by the head of the household or individual members.`
      },
      {
        chunk_title: "Income Certificate Required Documents",
        chunk_type: "documents",
        chunk_content: `## Required Documents:
1. **Identity Proof**: Aadhaar Card, Voter ID, or PAN Card.
2. **Address Proof**: Ration Card, electricity/water bill, or rent agreement.
3. **Age Proof**: Birth certificate or school leaving certificate.
4. **Income Proof**: Salary slip (for employees), Form 16, IT return, or local patwari/revenue report (for farmers/self-employed).
5. **Self-Declaration Affidavit** affirming the declared income is correct.`
      },
      {
        chunk_title: "Income Certificate Application Steps",
        chunk_type: "steps",
        chunk_content: `## How to Apply for Income Certificate:
- **Step 1**: Obtain application form from local administrative office or download from state e-District portal.
- **Step 2**: Fill in personal details, occupation, and family size.
- **Step 3**: Declare income from all sources (salary, business, land, pension).
- **Step 4**: Attach supporting document proofs and sign the declaration.
- **Step 5**: Local verification is conducted by a Revenue Inspector or Patwari.`
      },
      {
        chunk_title: "Income Certificate Submission and Fees",
        chunk_type: "submission",
        chunk_content: `## Submission and Certificate Delivery:
- **Where**: Local Tehsil office, Revenue department, e-District online portal, or Common Service Centre (CSC).
- **Processing Time**: Usually takes 10 to 15 days.
- **Validity**: Typically valid for one financial year.
- **Fees**: Minimal state service charge (usually ₹15 to ₹50).`
      }
    ]
  }
];

async function getEmbedding(text: string): Promise<number[]> {
  if (!nvidiaApiKey) {
    // If no API key, return a mock 1024-dimension vector for testing
    console.log(`Mocking embedding for: "${text.substring(0, 30)}..."`);
    return Array.from({ length: 1024 }, () => Math.random() - 0.5);
  }

  const res = await fetch("https://integrate.api.nvidia.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${nvidiaApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "nvidia/llama-nemotron-embed-1b-v2",
      input: [text],
      input_type: "passage",
      truncate: "END"
    })
  });

  if (!res.ok) {
    throw new Error(`NVIDIA API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  // Slice to 1024 dimensions (Matryoshka representation learning support) to fit pgvector HNSW limits
  return data.data[0].embedding.slice(0, 1024);
}

async function seed() {
  console.log("Starting seed of RAG knowledge base...");
  console.log(`Supabase URL: ${supabaseUrl}`);

  try {
    for (const form of formsToSeed) {
      console.log(`\nProcessing form: ${form.form_code} (${form.form_name})...`);

      // 1. Insert form metadata or get existing
      const { data: existingForm, error: fetchError } = await supabase
        .from("form_knowledge_base")
        .select("id")
        .eq("form_code", form.form_code)
        .maybeSingle();

      if (fetchError) {
        throw new Error(`Failed to check existing form: ${fetchError.message}`);
      }

      let formId: string;
      if (existingForm) {
        console.log(`Form ${form.form_code} already exists. Deleting its old chunks to re-seed...`);
        formId = existingForm.id;
        
        // Update metadata
        const { error: updateError } = await supabase
          .from("form_knowledge_base")
          .update({
            form_name: form.form_name,
            description: form.description,
            source_url: form.source_url,
            version: form.version,
            effective_date: form.effective_date,
            last_verified_at: new Date().toISOString()
          })
          .eq("id", formId);

        if (updateError) {
          throw new Error(`Failed to update form metadata: ${updateError.message}`);
        }

        // Delete old chunks
        const { error: deleteError } = await supabase
          .from("form_chunks")
          .delete()
          .eq("form_id", formId);

        if (deleteError) {
          throw new Error(`Failed to delete old chunks: ${deleteError.message}`);
        }
      } else {
        const { data: newForm, error: insertError } = await supabase
          .from("form_knowledge_base")
          .insert({
            form_code: form.form_code,
            form_name: form.form_name,
            description: form.description,
            source_url: form.source_url,
            version: form.version,
            effective_date: form.effective_date
          })
          .select("id")
          .single();

        if (insertError || !newForm) {
          throw new Error(`Failed to insert form metadata: ${insertError?.message}`);
        }
        formId = newForm.id;
      }

      // 2. Generate embeddings and insert chunks
      for (const chunk of form.chunks) {
        console.log(`Generating embedding for chunk: "${chunk.chunk_title}"...`);
        
        // Embed the title + content to have rich vector representation
        const embedText = `${chunk.chunk_title}\n\n${chunk.chunk_content}`;
        const embedding = await getEmbedding(embedText);

        const { error: chunkInsertError } = await supabase
          .from("form_chunks")
          .insert({
            form_id: formId,
            chunk_title: chunk.chunk_title,
            chunk_content: chunk.chunk_content,
            chunk_type: chunk.chunk_type,
            embedding: embedding
          });

        if (chunkInsertError) {
          throw new Error(`Failed to insert chunk "${chunk.chunk_title}": ${chunkInsertError.message}`);
        }
      }
      console.log(`Successfully seeded ${form.chunks.length} chunks for ${form.form_code}.`);
    }

    console.log("\nDatabase seeding completed successfully!");
  } catch (err: any) {
    console.error("\nSeeding failed with error:", err.message || err);
    process.exit(1);
  }
}

seed();
