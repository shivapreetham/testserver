// attendanceScraper.js
import { chromium } from 'playwright';

export async function scrapeAttendance(username, password) {
  console.log(`Scraping for ${username}`);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://online.nitjsr.ac.in/endsem/Login.aspx', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForSelector('#txtuser_id', { timeout: 30000 });
    await page.fill('#txtuser_id', username);
    await page.fill('#txtpassword', password);

    await Promise.all([
      page.click('#btnsubmit'),
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
    ]);

    await page.goto('https://online.nitjsr.ac.in/endsem/StudentAttendance/ClassAttendance.aspx', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForSelector('table.table', { timeout: 30000 });

    const attendanceData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table.table tr:not(:first-child)'));
      let currentIndex = 1;
      const cleanText = (text) => text?.trim().split('\n')[0].trim() || '';
      return rows
        .map((row) => {
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
        })
        .filter(Boolean);
    });

    const cleanAttendanceData = (data) =>
      data.filter((item) => !/^\d+$/.test(item.subjectName));
    const updateSerialNumbers = (data) =>
      data.map((item, index) => ({ ...item, slNo: (index + 1).toString() }));

    const finalData = updateSerialNumbers(cleanAttendanceData(attendanceData));
    console.log('Scraped data for', username, finalData);
    await browser.close();
    return finalData;
  } catch (error) {
    if (browser) await browser.close();
    console.error(`Error scraping for ${username}:`, error);
    throw error;
  }
}
