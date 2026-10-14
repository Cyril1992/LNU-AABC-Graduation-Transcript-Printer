// ==UserScript==
// @name         辽大毕业成绩单批量打印正式版-针对第二版系统（18-24级）
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  批量打印毕业成绩单，支持面板收起与自动更新
// @match        http://aabcjw.lnu.edu.cn/admin2/*
// @updateURL    https://github.com/Cyril1992/LNU-AABC-Graduation-Transcript-Printer/blob/main/lnu-aabc-grad-print.user.js.js
// @downloadURL  https://github.com/Cyril1992/LNU-AABC-Graduation-Transcript-Printer/blob/main/lnu-aabc-grad-print.user.js.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /******************** 默认设置，可在面板里修改 ********************/
  const BASE_URL = 'http://aabcjw.lnu.edu.cn/admin2/adminprint.asp';

  const DEFAULT_YEAR = '';
  const DEFAULT_MONTH = '';

  // 每次点击最终“打印”后等待多久，单位毫秒
  const DEFAULT_WAIT_AFTER_PRINT_MS = 10000;

  // 每个学生默认打印几份
  const DEFAULT_COPIES = 3;

  // 默认是否每次最终打印前弹确认框
  const DEFAULT_CONFIRM_BEFORE_PRINT = true;

  // 默认打印项目：默认只打印 GPA 和 GPA 排名
  const DEFAULT_PRINT_AVG_CREDITS = false;       // 打印平均学分值
  const DEFAULT_PRINT_AVG_CREDITS_RANK = false;  // 打印平均学分排名
  const DEFAULT_PRINT_GPA = true;                // 打印GPA绩点
  const DEFAULT_PRINT_GPA_RANK = true;           // 打印GPA绩点排名
  /**************************************************************/

  const STORE_KEY_COLLAPSED = 'lnu_grad_print_panel_collapsed';
  const STORE_KEY_LIST = 'lnu_grad_print_student_list';
  const STORE_KEY_INDEX = 'lnu_grad_print_current_index';
  const STORE_KEY_RUNNING = 'lnu_grad_print_running';
  const STORE_KEY_YEAR = 'lnu_grad_print_year';
  const STORE_KEY_MONTH = 'lnu_grad_print_month';
  const STORE_KEY_COPIES = 'lnu_grad_print_copies';
  const STORE_KEY_WAIT = 'lnu_grad_print_wait_ms';
  const STORE_KEY_CONFIRM = 'lnu_grad_print_confirm';

  const STORE_KEY_OPT_AVG_CREDITS = 'lnu_grad_print_opt_avg_credits';
  const STORE_KEY_OPT_AVG_CREDITS_RANK = 'lnu_grad_print_opt_avg_credits_rank';
  const STORE_KEY_OPT_GPA = 'lnu_grad_print_opt_gpa';
  const STORE_KEY_OPT_GPA_RANK = 'lnu_grad_print_opt_gpa_rank';

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function log(...args) {
    console.log('[辽大批量打印]', ...args);
  }

  function getSetting(key, defaultValue) {
    const value = localStorage.getItem(key);
    return value === null || value === '' ? defaultValue : value;
  }

  function getBoolSetting(key, defaultBool) {
    const defaultValue = defaultBool ? '1' : '0';
    return getSetting(key, defaultValue) === '1';
  }

  function setBoolSetting(key, value) {
    localStorage.setItem(key, value ? '1' : '0');
  }

  function getYear() {
    return getSetting(STORE_KEY_YEAR, DEFAULT_YEAR);
  }

  function getMonth() {
    return getSetting(STORE_KEY_MONTH, DEFAULT_MONTH);
  }

  function getCopies() {
    const n = Number(getSetting(STORE_KEY_COPIES, DEFAULT_COPIES));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_COPIES;
  }

  function getWaitAfterPrintMs() {
    const n = Number(getSetting(STORE_KEY_WAIT, DEFAULT_WAIT_AFTER_PRINT_MS));
    return Number.isFinite(n) && n >= 1000 ? n : DEFAULT_WAIT_AFTER_PRINT_MS;
  }

  function getConfirmBeforePrint() {
    return getBoolSetting(STORE_KEY_CONFIRM, DEFAULT_CONFIRM_BEFORE_PRINT);
  }

  function getPrintOptionsFromStorage() {
    return {
      avgCredits: getBoolSetting(STORE_KEY_OPT_AVG_CREDITS, DEFAULT_PRINT_AVG_CREDITS),
      avgCreditsRank: getBoolSetting(STORE_KEY_OPT_AVG_CREDITS_RANK, DEFAULT_PRINT_AVG_CREDITS_RANK),
      gpa: getBoolSetting(STORE_KEY_OPT_GPA, DEFAULT_PRINT_GPA),
      gpaRank: getBoolSetting(STORE_KEY_OPT_GPA_RANK, DEFAULT_PRINT_GPA_RANK)
    };
  }

  function getStudentList() {
    const raw = localStorage.getItem(STORE_KEY_LIST) || '';
    return raw
      .split(/[\s,，;；]+/)
      .map(x => x.trim())
      .filter(Boolean);
  }

  function setStudentList(listText) {
    localStorage.setItem(STORE_KEY_LIST, listText || '');
  }

  function getCurrentIndex() {
    return Number(localStorage.getItem(STORE_KEY_INDEX) || 0);
  }

  function setCurrentIndex(index) {
    localStorage.setItem(STORE_KEY_INDEX, String(index));
  }

  function isRunning() {
    return localStorage.getItem(STORE_KEY_RUNNING) === '1';
  }

  function setRunning(value) {
    localStorage.setItem(STORE_KEY_RUNNING, value ? '1' : '0');
  }

  function buildStudentUrl(studentId) {
    const year = getYear();
    const month = getMonth();

    return `${BASE_URL}?lnum=${encodeURIComponent(studentId)}&selldate=${encodeURIComponent(year)}&sellmonth=${encodeURIComponent(month)}`;
  }

  function getCurrentStudentIdFromUrl() {
    const params = new URLSearchParams(location.search);
    return params.get('lnum') || '';
  }

  function goToStudent(index) {
    const list = getStudentList();

    if (index >= list.length) {
      setRunning(false);
      alert(`全部完成，共处理 ${list.length} 个学号。`);
      return;
    }

    setCurrentIndex(index);
    const sid = list[index];
    const url = buildStudentUrl(sid);

    log(`跳转到第 ${index + 1}/${list.length} 个学生：${sid}`);
    location.href = url;
  }

  function findButtonByText(text) {
    const candidates = [...document.querySelectorAll('button, input[type="button"], input[type="submit"], a')];

    return candidates.find(el => {
      const t = (el.innerText || el.value || '').trim();
      return t.includes(text);
    });
  }

  async function waitForCondition(fn, timeout = 15000, interval = 300) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const result = fn();
      if (result) return result;
      await sleep(interval);
    }

    throw new Error('等待条件超时');
  }

  async function waitForElement(selector, timeout = 15000) {
    return waitForCondition(() => document.querySelector(selector), timeout);
  }

  async function waitForText(text, timeout = 15000) {
    return waitForCondition(() => document.body && document.body.innerText.includes(text), timeout);
  }

  async function waitForTranscriptPage() {
    await waitForCondition(() => {
      return document.body &&
        document.body.innerText.includes('辽宁大学学生历年学习成绩单') &&
        findButtonByText('打印');
    }, 15000);
  }

  async function clickTopPrintButton() {
    if (typeof window.openCommit === 'function') {
      log('调用 openCommit() 打开打印选项窗口');
      window.openCommit();
      return;
    }

    const titlePrintBtn = [...document.querySelectorAll('.title button, button')]
      .find(btn => (btn.innerText || '').trim() === '打印');

    if (!titlePrintBtn) {
      throw new Error('没有找到右上角“打印”按钮');
    }

    log('点击右上角“打印”按钮');
    titlePrintBtn.click();
  }

  function setCheckboxById(id, shouldCheck) {
    const el = document.querySelector(`#${id}`);

    if (!el) {
      log(`没有找到复选框：${id}`);
      return;
    }

    if (el.checked !== shouldCheck) {
      el.click();
    }
  }

  async function setPrintOptions() {
    await waitForElement('#noAvgCredits', 10000);
    await waitForElement('#noAvgCreditsRank', 10000);
    await waitForElement('#noAvgGpa', 10000);
    await waitForElement('#noAvgGpaRank', 10000);

    const options = getPrintOptionsFromStorage();

    setCheckboxById('noAvgCredits', options.avgCredits);
    setCheckboxById('noAvgCreditsRank', options.avgCreditsRank);
    setCheckboxById('noAvgGpa', options.gpa);
    setCheckboxById('noAvgGpaRank', options.gpaRank);

    log('已设置打印项目：', options);
  }

  async function clickFinalPrintButton(copyNo, totalCopies) {
    const finalBtn = document.querySelector('#btn_ok');

    if (!finalBtn) {
      throw new Error('没有找到弹窗底部 id="btn_ok" 的打印按钮');
    }

    if (getConfirmBeforePrint()) {
      const options = getPrintOptionsFromStorage();
      const selected = [
        options.avgCredits ? '平均学分值' : '',
        options.avgCreditsRank ? '平均学分排名' : '',
        options.gpa ? 'GPA绩点' : '',
        options.gpaRank ? 'GPA绩点排名' : ''
      ].filter(Boolean).join('、') || '未选择任何项目';

      const ok = confirm(`即将打印第 ${copyNo}/${totalCopies} 份。\n打印项目：${selected}\n是否继续？`);
      if (!ok) {
        setRunning(false);
        throw new Error('用户取消最终打印');
      }
    }

    log(`点击弹窗底部“打印”按钮：第 ${copyNo}/${totalCopies} 份`);
    finalBtn.click();
  }

  async function closePrintDialogIfNeeded() {
    await sleep(500);

    const closeBtn = [...document.querySelectorAll('button')]
      .find(btn => (btn.innerText || '').trim().includes('关闭窗口'));

    if (closeBtn) {
      log('关闭打印选项窗口');
      closeBtn.click();
      await sleep(500);
    } else if (typeof window.closeCommit === 'function') {
      log('调用 closeCommit() 关闭打印选项窗口');
      window.closeCommit();
      await sleep(500);
    }
  }

  async function printOneCopy(copyNo, totalCopies) {
    await clickTopPrintButton();
    await setPrintOptions();

    await sleep(300);

    await clickFinalPrintButton(copyNo, totalCopies);

    const waitMs = getWaitAfterPrintMs();

    try {
      await waitForText('打印成功', waitMs);
      log(`第 ${copyNo}/${totalCopies} 份检测到“打印成功”`);
    } catch (e) {
      log(`第 ${copyNo}/${totalCopies} 份未检测到“打印成功”，已等待 ${waitMs / 1000} 秒`);
      await sleep(waitMs);
    }

    await closePrintDialogIfNeeded();
  }

  async function printCurrentStudentAndNext() {
    const list = getStudentList();
    const index = getCurrentIndex();
    const currentSid = getCurrentStudentIdFromUrl();
    const copies = getCopies();

    if (!list.length) {
      setRunning(false);
      alert('还没有粘贴学号列表。');
      return;
    }

    if (!currentSid) {
      log('当前不是 adminprint 成绩单页面，跳转到当前进度学生');
      goToStudent(index);
      return;
    }

    log(`开始处理第 ${index + 1}/${list.length} 个学生，当前 URL 学号：${currentSid}，打印 ${copies} 份`);

    await waitForTranscriptPage();
    await sleep(500);

    for (let copyNo = 1; copyNo <= copies; copyNo++) {
      if (!isRunning()) {
        log('检测到暂停，停止当前学生后续打印');
        return;
      }

      await printOneCopy(copyNo, copies);

      if (copyNo < copies) {
        const waitMs = getWaitAfterPrintMs();
        log(`准备打印下一份，额外等待 ${waitMs / 1000} 秒`);
        await sleep(waitMs);
      }
    }

    setCurrentIndex(index + 1);

    if (index + 1 >= list.length) {
      setRunning(false);
      alert(`批量打印完成，共 ${list.length} 个学号，每人 ${copies} 份。`);
    } else {
      goToStudent(index + 1);
    }
  }

  function addPanel() {
    if (!document.body) return;
    if (document.getElementById('lnu-grad-print-panel')) return;

    const listText = localStorage.getItem(STORE_KEY_LIST) || '';
    const index = getCurrentIndex();
    const list = getStudentList();

    const year = getYear();
    const month = getMonth();
    const copies = getCopies();
    const waitMs = getWaitAfterPrintMs();
    const confirmBefore = getConfirmBeforePrint();
    const options = getPrintOptionsFromStorage();

    const panel = document.createElement('div');
    panel.id = 'lnu-grad-print-panel';
    panel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      width: 330px;
      z-index: 2147483647;
      background: white;
      color: black;
      border: 1px solid #666;
      box-shadow: 0 2px 10px rgba(0,0,0,.25);
      padding: 10px;
      font-size: 13px;
      line-height: 1.5;
      font-family: Arial, "Microsoft YaHei", sans-serif;
	  max-width: calc(100vw - 20px);
max-height: calc(100vh - 20px);
overflow-y: auto;
box-sizing: border-box;
    `;

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
  <strong style="font-size:12px;">亚澳成绩单批量打印 v1.3 - 王昕熠</strong>
  <button type="button" id="lnu-toggle-panel">－ 收起</button>
</div>

<div id="lnu-panel-content" style="margin-top:8px;">

      <div style="display:flex;gap:6px;margin-bottom:6px;">
        <label style="flex:1;">年：
          <input id="lnu-year" value="${year}" style="width:55px;">
        </label>
        <label style="flex:1;">月：
          <input id="lnu-month" value="${month}" style="width:40px;">
        </label>
        <label style="flex:1;">份数：
          <input id="lnu-copies" type="number" min="1" value="${copies}" style="width:45px;">
        </label>
      </div>

      <div style="margin-bottom:6px;">
        <label>每次打印后等待：
          <input id="lnu-wait-seconds" type="number" min="1" value="${Math.round(waitMs / 1000)}" style="width:50px;">
          秒
        </label>
      </div>

      <fieldset style="border:1px solid #ccc;margin:6px 0;padding:6px;">
        <legend>打印项目</legend>
        <label style="display:block;">
          <input id="lnu-opt-avg-credits" type="checkbox" ${options.avgCredits ? 'checked' : ''}>
          打印平均学分值
        </label>
        <label style="display:block;">
          <input id="lnu-opt-avg-credits-rank" type="checkbox" ${options.avgCreditsRank ? 'checked' : ''}>
          打印平均学分排名
        </label>
        <label style="display:block;">
          <input id="lnu-opt-gpa" type="checkbox" ${options.gpa ? 'checked' : ''}>
          打印GPA绩点
        </label>
        <label style="display:block;">
          <input id="lnu-opt-gpa-rank" type="checkbox" ${options.gpaRank ? 'checked' : ''}>
          打印GPA绩点排名
        </label>
      </fieldset>

      <div style="margin-bottom:6px;">
        <label>
          <input id="lnu-confirm-before-print" type="checkbox" ${confirmBefore ? 'checked' : ''}>
          每次最终打印前手动确认
        </label>
      </div>

      <div style="margin-bottom:4px;">学号列表：每行一个，或空格分隔</div>
      <textarea id="lnu-student-list" style="width:100%;height:90px;box-sizing:border-box;">${listText}</textarea>

      <div style="margin-top:6px;">
        当前进度：
        <input id="lnu-current-index" type="number" min="0" value="${index}" style="width:60px;">
        / <span id="lnu-total-count">${list.length}</span>
      </div>

      <div style="font-size:12px;color:#666;margin:4px 0;">
        进度从 0 开始；0 表示第 1 个学号。
      </div>

      <button id="lnu-save-list" style="width:100%;margin-top:4px;">保存设置、名单和进度</button>
      <button id="lnu-start-print" style="width:100%;margin-top:4px;">开始/继续批量打印</button>
      <button id="lnu-stop-print" style="width:100%;margin-top:4px;">暂停</button>
      <button id="lnu-test-current" style="width:100%;margin-top:4px;">只测试当前页面打印一份</button>

      <div id="lnu-status" style="font-size:12px;color:#333;margin-top:6px;">
        当前设置：毕业年月${year}年${month}月，每人 ${copies} 份
      </div></div>
    `;

    document.body.appendChild(panel);
const content = panel.querySelector('#lnu-panel-content');
const toggle = panel.querySelector('#lnu-toggle-panel');

function setCollapsed(collapsed) {
  content.style.display = collapsed ? 'none' : 'block';

  toggle.textContent = collapsed ? '＋ 展开' : '－ 收起';

  toggle.setAttribute('aria-expanded', String(!collapsed));

  panel.style.width = collapsed ? '245px' : '330px';

  localStorage.setItem(
    STORE_KEY_COLLAPSED,
    collapsed ? '1' : '0'
  );
}

toggle.addEventListener('click', () => {
  setCollapsed(content.style.display !== 'none');
});

// 恢复上次面板状态
setCollapsed(
  localStorage.getItem(STORE_KEY_COLLAPSED) === '1'
);
    const textarea = document.getElementById('lnu-student-list');
    const indexInput = document.getElementById('lnu-current-index');
    const totalCount = document.getElementById('lnu-total-count');
    const status = document.getElementById('lnu-status');

    function getSelectedOptionText() {
      const selected = [
        document.getElementById('lnu-opt-avg-credits').checked ? '平均学分值' : '',
        document.getElementById('lnu-opt-avg-credits-rank').checked ? '平均学分排名' : '',
        document.getElementById('lnu-opt-gpa').checked ? 'GPA绩点' : '',
        document.getElementById('lnu-opt-gpa-rank').checked ? 'GPA绩点排名' : ''
      ].filter(Boolean);

      return selected.length ? selected.join('、') : '未选择任何打印项目';
    }

    function saveAllSettings() {
      const yearValue = document.getElementById('lnu-year').value.trim();
      const monthValue = document.getElementById('lnu-month').value.trim();
      const copiesValue = document.getElementById('lnu-copies').value.trim();
      const waitSecondsValue = document.getElementById('lnu-wait-seconds').value.trim();
      const confirmValue = document.getElementById('lnu-confirm-before-print').checked;

      localStorage.setItem(STORE_KEY_YEAR, yearValue || DEFAULT_YEAR);
      localStorage.setItem(STORE_KEY_MONTH, monthValue || DEFAULT_MONTH);
      localStorage.setItem(STORE_KEY_COPIES, copiesValue || String(DEFAULT_COPIES));
      localStorage.setItem(STORE_KEY_WAIT, String((Number(waitSecondsValue) || 10) * 1000));
      setBoolSetting(STORE_KEY_CONFIRM, confirmValue);

      setBoolSetting(STORE_KEY_OPT_AVG_CREDITS, document.getElementById('lnu-opt-avg-credits').checked);
      setBoolSetting(STORE_KEY_OPT_AVG_CREDITS_RANK, document.getElementById('lnu-opt-avg-credits-rank').checked);
      setBoolSetting(STORE_KEY_OPT_GPA, document.getElementById('lnu-opt-gpa').checked);
      setBoolSetting(STORE_KEY_OPT_GPA_RANK, document.getElementById('lnu-opt-gpa-rank').checked);

      setStudentList(textarea.value);
      setCurrentIndex(Number(indexInput.value || 0));

      totalCount.innerText = String(getStudentList().length);

      status.innerText =
        `已保存：${getYear()}年${getMonth()}月，每人 ${getCopies()} 份，每次等待 ${getWaitAfterPrintMs() / 1000} 秒。项目：${getSelectedOptionText()}。`;
    }

    textarea.addEventListener('input', () => {
      const count = textarea.value.split(/[\s,，;；]+/).map(x => x.trim()).filter(Boolean).length;
      totalCount.innerText = String(count);
    });

    document.getElementById('lnu-save-list').addEventListener('click', () => {
      saveAllSettings();
      alert('已保存设置、名单、进度和打印项目。');
    });

    document.getElementById('lnu-start-print').addEventListener('click', () => {
      saveAllSettings();

      const options = getPrintOptionsFromStorage();
      const hasAnyOption = options.avgCredits || options.avgCreditsRank || options.gpa || options.gpaRank;

      if (!hasAnyOption) {
        const ok = confirm('你没有勾选任何打印项目，仍然继续吗？');
        if (!ok) return;
      }

      setRunning(true);

      const list = getStudentList();
      const idx = getCurrentIndex();

      if (!list.length) {
        alert('请先粘贴学号列表。');
        setRunning(false);
        return;
      }

      if (idx < 0 || idx >= list.length) {
        alert('当前进度超出名单范围。');
        setRunning(false);
        return;
      }

      goToStudent(idx);
    });

    document.getElementById('lnu-stop-print').addEventListener('click', () => {
      setRunning(false);
      status.innerText = '已暂停。';
      alert('已暂停。当前正在执行的动作可能会完成，但不会继续下一个学号。');
    });

    document.getElementById('lnu-test-current').addEventListener('click', async () => {
      try {
        saveAllSettings();

        const options = getPrintOptionsFromStorage();
        const hasAnyOption = options.avgCredits || options.avgCreditsRank || options.gpa || options.gpaRank;

        if (!hasAnyOption) {
          const ok = confirm('你没有勾选任何打印项目，仍然测试打印吗？');
          if (!ok) return;
        }

        await waitForTranscriptPage();
        await printOneCopy(1, 1);
        alert('当前页面测试打印一份已执行。');
      } catch (e) {
        console.error(e);
        alert('测试失败：' + e.message);
      }
    });
  }

  async function main() {
    addPanel();

    if (isRunning()) {
      try {
        await printCurrentStudentAndNext();
      } catch (e) {
        console.error(e);
        setRunning(false);
        alert('批量打印中断：' + e.message);
      }
    }
  }

  setTimeout(main, 800);

})();
