@echo off
rem MIT License
rem
rem Copyright (c) 2026 Sythos (https://www.sythos.net)
rem
rem Permission is hereby granted, free of charge, to any person obtaining a copy
rem of this software and associated documentation files (the "Software"), to deal
rem in the Software without restriction, including without limitation the rights
rem to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
rem copies of the Software, and to permit persons to whom the Software is
rem furnished to do so, subject to the following conditions:
rem
rem The above copyright notice and this permission notice shall be included in all
rem copies or substantial portions of the Software.
rem
rem THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
rem IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
rem FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
rem AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
rem LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
rem OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
rem SOFTWARE.
rem
rem SPDX-License-Identifier: MIT
rem Local test shim for environments where Corepack is not installed.
if /I "%~1"=="pnpm@11.22.0" shift
if defined IWSDK_PNPM_BIN (
  call "%IWSDK_PNPM_BIN%" %1 %2 %3 %4 %5 %6 %7 %8 %9
) else (
  pnpm.cmd %1 %2 %3 %4 %5 %6 %7 %8 %9
)
exit /b %errorlevel%
