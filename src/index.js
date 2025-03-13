import express from 'express';
import { chromium } from 'playwright';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

// Function to filter out rows where the subjectName is purely numeric.
function cleanAttendanceData(data) {
  return data.filter(item => !/^\d+$/.test(item.subjectName));
}

// Function to update the serial numbers sequentially.
function updateSerialNumbers(data) {
  return data.map((item, index) => ({
    ...item,
    slNo: (index + 1).toString(),
  }));
}

app.post('/scrape-attendance', async (req, res) => {
  let { username, password } = req.body;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://online.nitjsr.ac.in/endsem/Login.aspx', { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    await page.fill('#txtuser_id', username);
    await page.fill('#txtpassword', password);
    
    await Promise.all([
      page.click('#btnsubmit'),
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }),
    ]);

    await page.goto('https://online.nitjsr.ac.in/endsem/StudentAttendance/ClassAttendance.aspx', { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForSelector('table.table');

    const attendanceData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table.table tr:not(:first-child)'));
      let currentIndex = 1;
      const cleanText = (text) => text?.trim().split('\n')[0].trim() || '';

      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 6) return null;
        
        return {
          slNo: (currentIndex++).toString(),
          subjectCode: cleanText(cells[1]?.innerText),
          subjectName: cleanText(cells[2]?.innerText),
          facultyName: cleanText(cells[3]?.innerText),
          presentTotal: cleanText(cells[4]?.innerText),
          attendancePercentage: cleanText(cells[5]?.innerText),
        };
      }).filter(Boolean);
    });

    const cleanedData = cleanAttendanceData(attendanceData);
    const finalData = updateSerialNumbers(cleanedData);

    await browser.close();
    res.json(finalData);
  } catch (error) {
    if (browser) await browser.close();
    res.status(500).json({ error: 'Scraping failed', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
