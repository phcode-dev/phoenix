#!/usr/bin/env python
# encoding-test-files
# (c) University of Manchester 2014-2015
#
#   Licensed under the Apache License, Version 2.0 (the "License");
#   you may not use this file except in compliance with the License.
#   You may obtain a copy of the License at
# 
#       http://www.apache.org/licenses/LICENSE-2.0
# 
#   Unless required by applicable law or agreed to in writing, software
#   distributed under the License is distributed on an "AS IS" BASIS,
#   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#   See the License for the specific language governing permissions and
#   limitations under the License.
# 
#   See the NOTICE file distributed with this work for additional
#   information regarding copyright ownership.
 


import codecs


tests = [
          u'premi\u00e8re is first',  # latin1, cp865
          u'premie\u0300re is slightly different', # combining character
          u'\u041a\u0438\u0440\u0438\u043b\u043b\u0438\u0446\u0430 is Cyrillic', # koi8
          u'\U00010400 am Deseret'  # only in utf8/utf16
        ]

encodings = ("ascii", "utf8", "utf16", "cp865", "latin1", "koi8_r")

for codec in encodings:
    f = codecs.open("%s.txt" % codec, "w", codec, "replace")
    s = "\n".join(tests) + "\n"
    f.write(s)
    f.close()


